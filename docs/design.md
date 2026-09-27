# 家庭记账簿 — 设计文档

> 状态：**已按代码现状重写**（基线分支 `feature/access-category-management`）。
> 本文描述的是**当前真实存在**的系统。写计划/改需求前先读 `docs/status.md`（代码事实基线），冲突时以它为准。
> 架构口径：**Spring Boot（Java 17）+ Vue 3 + MySQL 8**。原 Node/Express + SQLite 后端 `server/` 已删除，
> 其能力（含家庭访问控制）全部由 `backend/` 承接；需要回溯可查备份分支 `backup/before-server-removal`。

---

## 1. 目标与范围

### 1.1 产品定位
单家庭自用的记账 + 资产负债管理工具。核心价值：**记录每一笔钱，随时知道家庭有多少资产、欠多少钱、净资产是多少。**

### 1.2 已落地的技术决策

| 决策项 | 选择 | 说明 |
| --- | --- | --- |
| 形态 | 全栈 Web，Spring Boot + MySQL | 多设备访问同一份账本 |
| 后端 | **Java 17 + Spring Boot 3.3 + Spring JDBC（JdbcTemplate）** | 事务用 Spring `@Transactional`；不引入 ORM，保持 SQL 显式 |
| 前端 | **Vue 3 + TypeScript + Vite** | 无 `vue-router`、无 Pinia；Tab 切换是自实现的 hash 路由 |
| 持久化（权威） | MySQL 8（金额 `BIGINT` 存「分」） | 结构演进走自研 `Migrator` + `V*.sql` 版本化迁移 |
| 持久化（缓存） | 浏览器 IndexedDB | 仅做 GET 读缓存（SWR），非事实来源 |
| UI 侧重 | 移动端优先 | 桌面端居中限宽 1180px，断点 768px |
| 测试 | 后端 JUnit 5 + H2（Maven）；前端 Vitest + Vue Test Utils | 后端冒烟测试与前端测试各自独立 |
| 部署 | Docker Compose（web / app / mysql）+ Nginx | 对外仅暴露 80 端口 |
| 访问保护 | 共享家庭访问口令 + 签名可信设备会话（后端实现） | 详见 §6 |

### 1.3 明确不做（YAGNI）
- 不做邀请、角色、权限分级、成员停用
- 不做资产估值自动更新、折旧、行情同步
- 不做负债利率、期限、等额本息排期、本金/利息拆分
- 不做多账套切换、预算、账单提醒、导入导出

---

## 2. 架构

```
┌────────────── 浏览器（移动端优先）──────────────┐
│  Vue 3 SPA (Vite)                               │
│  ├─ features/accounting  记账 · 账目列表 · 筛选  │
│  ├─ features/assets      账户 · 资产项 · 市值    │
│  ├─ features/liabilities 负债 · 还款             │
│  ├─ features/analysis    净资产 · 趋势 · 占比    │
│  └─ features/settings    家庭 · 成员             │
│                                                 │
│  lib/api.ts ── fetch ──► lib/idbCache.ts        │
│       │       (SWR 5s)   (IndexedDB 读缓存)     │
│  401 → family-access-lost 事件 → /unlock.html   │
└───────┼─────────────────────────────────────────┘
        │ HTTP JSON（dev: Vite proxy；prod: Nginx 反代 /api）
┌───────▼─────────────────────────────────────────┐
│  Spring Boot API（唯一写入口）                    │
│  ├─ /api/access       公开：unlock / lock / 校验 │
│  ├─ AccessGuard       守卫：其余 /api 全部要会话 │
│  ├─ controller/       参数校验 → service          │
│  ├─ service/Ledger    账户余额、账目、还款联动 ★  │
│  ├─ service/Stats     净资产、趋势、分类占比、快照│
│  ├─ access/           家庭访问口令与可信设备会话  │
│  └─ db/               Migrator · Seeder           │
│                        └─► MySQL 8                │
└─────────────────────────────────────────────────┘
```

**核心纪律**：账户余额、负债剩余本金、关联支出三者必须在**同一个数据库事务**内联动变更（`@Transactional`）。任何绕过 `LedgerService` 与 `AccountService.applyBalanceDelta` 的写路径都不允许存在。

---

## 3. 数据模型

单家庭：`family` 表恒为一行（`id = 1`），成员/账户/负债等表不冗余 `family_id`（YAGNI）。

> 所有金额以**整数分**（`BIGINT`）存储，杜绝浮点误差；对外 JSON 以「元」的字符串返回两位小数（`"12.34"`），转换只走 `common/Money`。时间戳统一 `VARCHAR(19)`，由应用层写入，规避 MySQL/H2 方言与时区差异。

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `family` | id=1, name, created_at | 默认「我的家」，可改名 |
| `member` | id, name, color, created_at | 默认「我」；color 可空 |
| `account` | id, name, balance_cents, member_id(NULL=家庭共有), is_default, created_at | 默认账户「默认账户」，允许负余额、可手动校准 |
| `category` | id, kind(`expense`\|`income`), name, created_at, UNIQUE(kind, name) | 默认「其他」「其他收入」；支出/收入互相独立 |
| `txn` | id, type(`expense`\|`income`\|`transfer`), amount_cents, occurred_on, account_id, to_account_id(NULL), category_id(NULL), member_id(NULL), note, source_type(`manual`/`repayment`), source_id, created_at | 账目主表（**表名是 `txn`**，`transaction` 是 SQL 保留字）。转账两账户都不为 NULL；还款生成的支出 `source_type='repayment'` |
| `asset` | id, name, value_cents, kind, member_id, updated_at, updated_by_member_id | 不关联账户，不影响记账余额 |
| `asset_snapshot` | id, asset_id, **snap_month**, value_cents, note, recorded_at, UNIQUE(asset_id, snap_month) | 资产月度市值快照，用户更新市值时写入；历史月份可能缺失，读取时回退当前市值（列名用 `snap_month`，`month` 是 H2 保留字） |
| `schema_migration` | version, name, checksum, applied_at, execution_ms | 迁移版本表，由 `db/Migrator` 维护 |
| `liability` | id, name, remaining_cents, monthly_payment_cents, payment_day(NULL), member_id, created_at | |
| `repayment` | id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at | 每笔还款对应一笔自动生成的支出 |

### 3.1 派生口径（唯一公式，不可散落各处）
- 总资产 = `Σ account.balance_cents` + `Σ asset.value_cents`
- 总负债 = `Σ liability.remaining_cents`
- 净资产 = 总资产 − 总负债
- 月供合计 = `Σ liability.monthly_payment_cents`
- 当月结余 = 当月 income 合计 − 当月 expense 合计（**含**还款生成的支出，**不含**转账）

---

## 4. 核心业务规则

### 4.1 账目
| 场景 | 账户余额变化 | 计入收支统计 |
| --- | --- | --- |
| 支出 | −amount | 是 |
| 收入 | +amount | 是 |
| 转账 | 转出 −amount，转入 +amount | **否** |

- 金额必须 > 0；编辑账目先回滚旧记录对账户的影响，再应用新值；删除账目完整回滚
- `source_type = 'repayment'` 的支出不可编辑、不可删除（409 `GENERATED_BY_REPAYMENT`），需删除对应还款记录
- 负余额允许保存，但响应体携带 `warnings: [{accountId, balance}]`，前端提示

### 4.2 默认账户
唯一 `is_default = 1`。设置新的默认账户时，原子地清除其他账户的默认标记。

### 4.3 还款（最容易出错的地方）
一次事务内完成四件事：
1. 写 `repayment` 记录
2. 生成 `txn`(type=`expense`, source_type=`repayment`, source_id=repayment.id, amount, occurred_on, account_id, category=「还款」支出分类, note=`还款 - {负债名}`)
3. `account.balance_cents -= amount`
4. `liability.remaining_cents -= amount`

反向操作（删除还款）必须完整回滚上述四项；删除负债级联回滚其全部还款。
约束：还款金额不得大于剩余本金；未填金额时取该负债月供，月供为 0 则必须手动输入。

> 口径说明：还款支出统一挂在支出分类「还款」（`V2__repayment_category.sql` 建分类并把历史
> `source_type='repayment'` 的账目从「其他」订正过来）。分类占比等统计因此会看到独立的「还款」支出。

### 4.4 资产市值
更新市值写在「某月底」名下：选当前月即刷新资产当前市值，选历史月为补录快照，未来月份返回 400 `FUTURE_MONTH`。月末截面统计在缺少快照时回退当前市值并标记 `assetsEstimated`。

### 4.5 删除保护
- 有交易的账户不允许删除，返回 409 `ACCOUNT_IN_USE` + 交易笔数
- 删除成员后，其名下的账目/资产/负债转为「家庭共有」，不级联删除

### 4.6 分类（当前能力）
按 kind 列出 + upsert（同名复用，不重复创建）；记账表单内联新建分类后自动选中。**重命名、置顶、归档、删除均未实现**（`category` 表无 `is_archived`/`is_pinned`），记账表单目前平铺展示该 kind 的全部分类。

---

## 5. API 设计

全部前缀 `/api`，JSON 收发，错误统一 `{ error: { code, message } }`（400 校验失败 / 404 不存在 / 409 业务冲突）。

```
# 访问控制（公开）
POST /api/access/unlock   {code}        204 / 401 ACCESS_DENIED / 429 TOO_MANY_ATTEMPTS
POST /api/access/lock                   204
GET  /api/access/session                204（供代理层鉴权）/ 401
GET  /healthz                           204

# 业务（受保护，需可信设备会话）
GET   /api/family                     PUT  /api/family            {name}
GET   /api/members                    POST /api/members           {name,color?}
                                      PATCH/DELETE /api/members/:id
GET   /api/accounts                   POST /api/accounts          {name,balance?,memberId?}
PATCH /api/accounts/:id               DELETE /api/accounts/:id
POST  /api/accounts/:id/set-default   PATCH /api/accounts/:id/calibrate {balance}
GET   /api/categories?kind=expense    POST /api/categories        {kind,name}
GET   /api/transactions?month=&type=&accountId=&memberId=&page=&pageSize=
POST  /api/transactions               GET /api/transactions/:id
PATCH /api/transactions/:id           DELETE /api/transactions/:id
GET   /api/assets                     POST/PATCH /api/assets  DELETE /api/assets/:id
GET   /api/assets/:id/snapshots       POST /api/assets/:id/snapshots
DELETE /api/assets/snapshots/:snapshotId
GET   /api/liabilities                POST/PATCH/DELETE
GET   /api/repayments?liabilityId=    POST /api/repayments        DELETE /api/repayments/:id
GET   /api/stats/summary
GET   /api/stats/monthly-trend?months=6&end=YYYY-MM
GET   /api/stats/category-breakdown?month=YYYY-MM
GET   /api/stats/monthly-snapshot?month=YYYY-MM
```

服务启动时执行幂等 `seed()`：无家庭则创建「我的家」+ 成员「我」+「默认账户」+ 支出分类「其他」+ 收入分类「其他收入」，满足「不配置任何东西也能记第一笔账」。

---

## 6. 家庭访问控制

目标：不引入账号体系的前提下，保护部署在公网上的家庭账本。

| 项 | 约定 |
| --- | --- |
| 实现位置 | `backend` 的 `com.familyledger.access` 包（Node 版实现已随 `server/` 删除） |
| 凭据 | 一个共享的家庭访问口令，来自部署环境变量，**绝不入库、绝不进浏览器存储** |
| 可信设备 | 解锁后 30 天内免密，可手动锁定；轮换密钥即让全部设备失效 |
| 边界 | **服务端是唯一安全边界**，Vue 路由与解锁页只是 UX |
| 会话 | `base64url({exp})` + HMAC-SHA256 签名，30 天；Cookie `family_access`：`Path=/; HttpOnly; SameSite=Strict`，生产追加 `Secure` |
| 环境变量 | `FAMILY_ACCESS_CODE`、`SESSION_SECRET`、`TRUST_PROXY_HOPS`（非负整数，默认 0）；生产判定用 Spring profile `prod`/`production` |
| 生产保护 | 生产 profile 下强制启用；缺任一密钥时 `AccessConfig` 在容器启动时抛异常，**进程拒绝启动** |
| 限流 | 同 IP 滚动 15 分钟 5 次失败 → 429（进程内内存，多实例不共享） |
| 代理 | 部署在反向代理后必须设 `TRUST_PROXY_HOPS=1`，否则客户端 IP 识别失效、限流误伤 |

前端链路：任意请求收到 401 → `api.ts` 派发 `family-access-lost` → `App.vue` 跳转 `/unlock.html?next=<原 hash>`（保留目标页）→ 解锁成功后回到该 hash。`next` 必须以单个 `#` 开头且不能以 `##` 开头，否则回落首页（防开放重定向）。

---

## 7. 前端结构

底部五 Tab（移动端），桌面端顶部导航 + 居中限宽：

| Tab | hash | 内容 |
| --- | --- | --- |
| 记账 | `#accounting` | 本月账目（按日分组、倒序）+ 收支合计 + 筛选 + 悬浮「记一笔」 |
| 资产 | `#assets` | 净资产/总资产/总负债 + 资金账户区 + 资产项区（可切按成员/类型） |
| 负债 | `#liabilities` | 总负债/月供合计 + 负债列表（进度条 + 行内「还一笔」） |
| 分析 | `#analysis` | 月度结余 + 近 6 个月柱状趋势 + 支出分类环形占比 + 空状态引导 |
| 设置 | `#settings` | 家庭名、成员增删改 |

- **记一笔**：底部弹层，三类型切换，分类宫格 + 内联新建（新分类与已选分类互斥），金额校验后可保存
- 图表全部手写 SVG，**不引入图表库**
- 删除操作统一二次确认；列表/统计有骨架屏、空状态、错误重试三态
- 读缓存：`cachedGet` 走 IndexedDB（默认 5 秒新鲜期，SWR 先吐缓存再后台刷新），写操作成功后按资源前缀失效

---

## 8. 测试策略

- **backend**（`cd backend && mvn -s mvn-settings.xml test`，H2 内存库）：
  - 领域层：`Money`（分↔元、精度）、`LedgerService`（三类账目对余额的影响、编辑/删除回滚、负余额告警）、`RepaymentService`（四步联动与回滚）、`StatsService`（净资产/趋势/占比/月末快照口径、转账不计）
  - 访问控制：`AccessSessionTest`（会话签名与过期、篡改与畸形、密钥轮换、Cookie 属性、生产 fail-fast、限流窗口）、`AccessControllerTest`（未解锁 401、解锁下发 Cookie、锁定、session 端点、429、/healthz 公开）
  - `SmokeTest`：US-01→US-09 全链路冒烟；`MigratorTest`：迁移幂等与防篡改
- **web**（`npm test`）：Vitest + jsdom + Vue Test Utils，覆盖记账表单默认值与筛选、列表分组、图表空状态、解锁跳转
- 提交前 `mvn test` 与 `npm test && npm run typecheck` 必须全绿；新逻辑先写失败测试

---

## 9. 假设与风险

| # | 假设 | 若不成立的影响 |
| --- | --- | --- |
| A1 | 单家庭，不引入 `family_id` | 未来多家庭需加列迁移，成本可控 |
| A2 | 还款生成的支出挂在专用分类「还款」 | 若不想让它出现在分类占比里，需在统计侧排除 |
| A3 | 还款金额不得大于剩余本金（400） | 规格未定义，此为保守处理 |
| A4 | 删除负债时级联删除还款并回滚余额与关联支出 | 若要求保留历史账务，需改为软删除 |
| A5 | IndexedDB 仅做 GET 读缓存，写操作直连后端并在成功后清缓存 | 若需离线写，需改双层同步方案 |
| A6 | 结构演进靠自研 `Migrator` + `V*.sql`，已应用脚本改动即拒绝启动 | 改表必须先新增版本脚本（脚本需 MySQL 与 H2 都兼容），并先备份 |
| A7 | 后端测试用 H2（MySQL 兼容模式）而非真实 MySQL | 使用了 MySQL 专有语法（如 `ALGORITHM=INSTANT`）的脚本会让本地测试失败 |
| A8 | 访问控制依赖部署侧正确设置 `TRUST_PROXY_HOPS` 与 HTTPS | 漏配会导致限流失效或全体误伤；HTTP 下口令明文传输 |
| A9 | 会话无状态、限流在进程内内存 | 多实例部署时限流不共享；服务端无法主动吊销单个会话，只能轮换 `SESSION_SECRET` |

---

## 10. 未实现事项

以下内容**当前代码中不存在**，不作为既有能力描述；计划与待办清单见 `docs/status.md` §6：

- 分类的归档 / 置顶 / 重命名 / 删除，以及带搜索的「全部分类」抽屉
- 设置页的分类管理入口与「锁定本设备」入口
- Nginx 层的 `auth_request` 强制拦截与 Node 版生产镜像
