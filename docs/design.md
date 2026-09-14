# 家庭记账簿 MVP — 设计文档

> 依据 `tmp.md`（6 Epic / 9 User Story）与已确认的四项技术决策编写。
> 本文档是下游实施计划的唯一输入。改需求先改这里。

---

## 1. 目标与范围

### 1.1 产品定位
单家庭自用的记账 + 资产负债管理工具。核心价值：**记录每一笔钱，随时知道家庭有多少资产、欠多少钱、净资产是多少。**

### 1.2 已确认的技术决策

| 决策项 | 选择 | 理由 |
| --- | --- | --- |
| 形态 | 全栈 Web（Node + Express + SQLite） | 多设备访问同一份账本；数据不锁死在某台浏览器 |
| 前端 | React + TypeScript + Vite | 生态标准，构建快 |
| 持久化（权威） | SQLite（`node:sqlite` 内置模块） | Node 22 自带，无需原生编译，零外部依赖 |
| 持久化（缓存） | 浏览器 IndexedDB | 读缓存 + 离线兜底，非事实来源 |
| UI 侧重 | 移动端优先 | 「随手记账」是真实场景，桌面居中限宽展示 |
| 测试 | Vitest（server + web）+ Supertest（API） | 统一测试运行器 |

### 1.3 明确不做（来自规格 + YAGNI）
- 不做邀请、角色、权限、成员停用
- 不做分类排序、停用、独立管理页
- 不做资产估值历史、折旧、行情自动更新
- 不做负债利率、期限、等额本息排期
- 不做还款期数、本金/利息拆分、提前还款罚息
- 不做多账套切换、预算、账单提醒、导入导出（MVP 后议）

---

## 2. 架构

```
┌─────────────── 浏览器（移动端优先）───────────────┐
│  React SPA (Vite)                                │
│  ├─ features/accounting  记账 · 账目列表 · 筛选    │
│  ├─ features/assets      账户 · 资产项             │
│  ├─ features/liabilities 负债 · 还款               │
│  ├─ features/analysis    净资产 · 三图表           │
│  └─ features/settings    家庭 · 成员               │
│                                                  │
│  lib/api.ts  ── fetch ──► lib/idbCache.ts         │
│       │        (SWR)      (IndexedDB 读缓存)      │
└───────┼───────────────────────────────────────────┘
        │ HTTP JSON  (Vite dev proxy / same origin)
┌───────▼───────────────────────────────────────────┐
│  Express API（唯一写入口）                         │
│  ├─ routes/          参数校验 → 调用 service       │
│  ├─ services/ledger  账户余额、账目、还款联动 ★     │
│  ├─ services/stats   净资产、趋势、分类占比         │
│  └─ db/              schema.sql · migrate · seed   │
│                        └─► SQLite 文件              │
└───────────────────────────────────────────────────┘
```

**核心纪律**：账户余额、负债剩余本金、关联支出三者必须在**同一个 SQLite 事务**内联动变更。任何绕过 `services/ledger` 的写路径都不允许存在。

---

## 3. 数据模型

单家庭 MVP：`family` 表恒为一行（`id = 1`），成员/账户/负债等表不冗余 `family_id` 字段（YAGNI；多家庭改造留在各表加列 + 迁移）。

> 所有金额以**整数分**（`INTEGER`）存储，杜绝浮点误差。对外 JSON 一律以 `"元"` 的字符串形式返回两位小数。

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `family` | id=1, name, created_at | 默认「我的家」，可改名 |
| `member` | id, name, color, created_at | 默认「我」；color 可空 |
| `account` | id, name, balance_cents, member_id(NULL=家庭共有), is_default, created_at | 默认账户 name=「默认账户」, balance=0, is_default=1；允许负余额；余额可被手动校准 |
| `category` | id, kind(`expense`\|`income`), name, created_at, UNIQUE(kind, name) | 默认「其他」「其他收入」；支出/收入互相独立 |
| `transaction` | id, type(`expense`\|`income`\|`transfer`), amount_cents, occurred_on, account_id, to_account_id(NULL), category_id(NULL), member_id(NULL), note, source_type(`manual`/`repayment`), source_id(NULL), created_at | 「账目」主表。转账两账户都不为 NULL；还款生成的支出 source_type=`repayment` |
| `asset` | id, name, value_cents, kind, member_id, updated_at, updated_by_member_id | 不关联账户，不影响记账余额 |
| `liability` | id, name, remaining_cents, monthly_payment_cents, payment_day(NULL), member_id, created_at | |
| `repayment` | id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at | 每笔还款对应一笔生成的支出 |

### 3.1 派生口径（唯一公式，不可散落各处）
- 总资产 = `Σ account.balance_cents` + `Σ asset.value_cents`
- 总负债 = `Σ liability.remaining_cents`
- 净资产 = 总资产 − 总负债
- 月供合计 = `Σ liability.monthly_payment_cents`
- 当月结余 = 当月 income 合计 − 当月 expense 合计（**含**还款生成的支出，**不含**转账）

---

## 4. 核心业务规则

### 4.1 账目（US-03）
| 场景 | 账户余额变化 | 计入收支统计 |
| --- | --- | --- |
| 支出 | −amount | 是 |
| 收入 | +amount | 是 |
| 转账 | 转出 −amount，转入 +amount | **否** |

- 金额必须 > 0，保留两位小数
- 编辑账目：先回滚旧记录对账户的影响，再应用新值
- 删除账目：完整回滚
- `source_type = 'repayment'` 的支出不可编辑、不可删除，需删除对应还款记录
- 负余额允许保存，但响应体携带 `warnings: [{accountId, balance}]`，前端红线提示

### 4.2 默认账户
唯一 `is_default = 1`。设置新的默认账户时，原子地清除其他账户的默认标记。

### 4.3 还款（US-08）—— 最容易出错的地方
一次事务内完成四件事：
1. 写 `repayment` 记录
2. 生成 `transaction`(type=`expense`, source_type=`repayment`, source_id=repayment.id, amount, occurred_on, account_id, category=默认「其他」, note=`还款 - {负债名}`)
3. `account.balance_cents -= amount`
4. `liability.remaining_cents -= amount`

反向操作（删除还款）必须完整回滚上述四项。
约束：还款金额不得大于剩余本金（规格仅允许「大于月供」，不允许透支还债）。

### 4.4 删除保护（US-02 #9）
有交易的账户不允许删除，返回 409 + 具体交易笔数，前端引导用户先处理账目。

---

## 5. API 设计

全部前缀 `/api`，JSON 收发，错误统一 `{ error: { code, message } }`。

```
GET   /api/family                     PUT  /api/family            {name}
GET   /api/members                    POST /api/members           {name,color?}
                                      PATCH/DELETE /api/members/:id
GET   /api/accounts                   POST /api/accounts          {name,balance?,memberId?}
PATCH /api/accounts/:id               DELETE /api/accounts/:id
POST  /api/accounts/:id/set-default   PATCH /api/accounts/:id/calibrate {balance}
GET   /api/categories?kind=expense    POST /api/categories        {kind,name}
GET   /api/transactions?month=&type=&accountId=&memberId=&page=    POST   /api/transactions
GET   /api/transactions/:id           PATCH /api/transactions/:id  DELETE /api/transactions/:id
GET   /api/assets                     POST/PATCH/DELETE
GET   /api/liabilities                POST/PATCH/DELETE
GET   /api/repayments?liabilityId=    POST   /api/repayments       DELETE /api/repayments/:id
GET   /api/stats/summary              总资产/总负债/净资产/月供合计/账户余额合计/资产市值合计
GET   /api/stats/monthly-trend?months=6
GET   /api/stats/category-breakdown?month=YYYY-MM
```

服务启动时执行幂等 `seed()`：无家庭则创建「我的家」+ 成员「我」+「默认账户」+ 默认分类。满足 US-01「用户不配置任何东西也能记第一笔账」。

---

## 6. 前端结构

底部五 Tab（移动端），桌面端居中限宽 480px：

| Tab | 内容 | 对应 Story |
| --- | --- | --- |
| 记账 | 本月账目列表（按日分组、倒序）+ 收支合计 + 筛选条 + 悬浮「记一笔」 | US-03/04/05 |
| 资产 | 总资产卡 + 资金账户区 + 资产项区 + 按成员/类型汇总 | US-02/06 |
| 负债 | 总负债/月供合计卡 + 负债列表 +「还一笔」 | US-07/08 |
| 分析 | 净资产三数字 + 月度收支趋势 + 支出分类占比 + 空状态 | US-09 |
| 设置 | 家庭名、成员增删改名 | US-01 |

- **记一笔**：底部弹层，三类型切换（支出/收入/转账），金额键盘即可保存；分类支持内联新建（US-04）
- 图表全部手写 SVG，**不引入图表库**：月度趋势用柱状图，分类占比用环形图（stroke-dasharray 实现），省一个依赖
- 删除操作统一二次确认浮层

---

## 7. 测试策略（TDD）

- **server**：Vitest + Supertest。每个测试用临时 SQLite 文件、独立实例；按 RED → GREEN 推进
  - 领域层：`money`（分↔元、精度）、`ledger`（三种账目对余额的影响、编辑/删除回滚、负余额告警）、`repayment`（四步联动与回滚）、`stats`（总资产/负债/净资产/趋势/占比口径、转账不计）
  - API 层：每个端点 happy path + 关键错误路径（409 删账户、还款不能删、金额 ≤ 0、重名分类）
- **web**：Vitest + jsdom + Testing Library。覆盖记账表单默认值、成员/账户归属默认、列表排序与合计、图表空状态
- 提交前必须全绿；**先写失败测试，禁止先写业务代码**

---

## 8. 假设与风险

| # | 假设 | 若不成立的影响 |
| --- | --- | --- |
| A1 | 单家庭，不引入 `family_id` | 未来多家庭需加列迁移，成本可控 |
| A2 | 还款生成的支出挂在默认分类「其他」，UI 通过 `source_type` 打「还款」标记 | 若想独立统计「还款」支出，需新增专用分类 |
| A3 | 还款金额不得大于剩余本金（返回 400） | 规格未定义，此为保守处理 |
| A4 | 删除负债时级联删除其还款记录并回滚账户余额与关联支出 | 若要求保留历史账务，需改为软删除 |
| A5 | IndexedDB 仅做 GET 读缓存（SWR），所有写操作直连后端并在成功后清缓存 | 若需离线写，需改双层同步方案 |
| A6 | 依赖 Node 22 内置的 `node:sqlite` | 若目标环境 Node < 22.5，需换 `better-sqlite3`（需原生编译） |

---

## 9. 待确认

以上为本轮设计稿。**确认后将据此拆分实施计划（每任务 2-5 分钟），再进入子代理驱动的 TDD 实现。**
