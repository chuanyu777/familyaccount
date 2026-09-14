# 家庭记账簿 MVP — 实施计划

> 上游：`docs/design.md`。每任务 2-5 分钟，均强制 **RED → GREEN → REFACTOR**。
> 运行命令前先执行 `export PATH="/usr/bin:/bin:$PATH"`（本机 Git Bash 的 PATH 被上层脚本破坏）。
> Node 用绝对路径：`C:/Users/86188/.workbuddy/binaries/node/versions/22.22.2-3/node.exe`（npm 用同目录 `npm.cmd`）。

## 全局约定

- **金额**：DB 与内部一律 `amount_cents: number`（整数分）；对外 JSON 字段 `amount: "12.34"`（字符串，两位小数元）。转换只能走 `server/src/domain/money.ts`。
- **错误响应**：统一 `{ error: { code, message } }`；HTTP 400 校验失败、404 不存在、409 业务冲突。
- **事务**：任何写多处表的服务方法必须整体包裹 `db.exec('BEGIN')/COMMIT/ROLLBACK`。
- **已就绪**：`package.json`、`tsconfig.json`、`vitest.config.ts`、`server/src/db/schema.sql`、`server/src/db/connection.ts`（`createTestDb()`）。

## 测试命令

```bash
export PATH="/usr/bin:/bin:$PATH"; cd /c/Users/86188/WorkBuddy/2026-09-13-00-30-20
npm test -- --project server                  # 只跑服务端
npm test -- --project web                     # 只跑前端
npm test                                      # 全量
```

---

## Phase 1 — E01 家庭初始化 + E02 账户（数据层）

### T1：金额转换工具
- 文件：`server/src/domain/money.ts`、`server/src/domain/money.test.ts`
- 要做：`toCents(input)`（number/string → 整数分，拒绝 NaN/负数以外的非法输入，四舍五入到分）、`toYuanString(cents)`（→ `"12.34"`，负数 → `"-12.34"`）、`formatCents` 别名不用做。
- 验证：`Yuan 0.1+0.2=0.3` 精确通过；`toCents("12.345") === 1235`（四舍五入到分，避免浮点）；`toCents(-1) === -100`；`toYuanString(-5) === "-0.05"`；非法输入抛错。

### T2：初始化种子数据
- 文件：`server/src/db/seed.ts`、`server/src/db/seed.test.ts`
- 要做：`ensureSeeded(db)`：若 `family` 为空 → 插入 `family(id=1,name='我的家')`、`member(name='我')`、`account(name='默认账户',balance_cents=0,is_default=1)`、`category(kind='expense',name='其他')`、`category(kind='income',name='其他收入')`。**幂等**：连调两次不重复创建。
- 验证：`ensureSeeded` 一次后各表各 1 行；再调用一次行数不变、无抛错；默认账户 `is_default=1`。

### T3：成员服务
- 文件：`server/src/services/members.ts`、`members.test.ts`
- 要做：`listMembers`、``createMember({name, color?})``、`updateMember(id, patch)`、`deleteMember(id)`。删除成员后其名下 account/asset/liability 的 `member_id`（若 FK 未自动置空则显式置 NULL）、txn 记录的 `member_id` 同理。
- 验证：创建后 id 递增；改名生效；删除后关联行的 `member_id` 为 NULL 且不报错；`createMember({name:''})` 抛 400 级错误。

### T4：账户服务（含默认账户与校准）
- 文件：`server/src/services/accounts.ts`、`accounts.test.ts`
- 要做：
  - `listAccounts()` 返回账户 + `balance`（元字符串）
  - `createAccount({name, memberId?})`：balance 默认 0
  - `updateAccount(id, {name?, memberId?})`
  - `setDefaultAccount(id)`：同一事务内先把所有账户 `is_default=0`，再置目标为 1
  - `calibrateBalance(id, cents)`：直接改写 `balance_cents`（新基准）
  - `canDeleteAccount(id)`：查关联 txn 数；`deleteAccount(id)`：有关联 txn 抛 409 并携带笔数
  - 内部 `applyBalanceDelta(id, cents)`（供 ledger 复用）
- 验证：默认账户切换后只有一个 `is_default=1`；校准后余额等于新值；有交易的账户删除抛 409、无交易的删得掉；负余额可保存。

### T5：设置与成员路由
- 文件：`server/src/routes/family.routes.ts`、`member.routes.ts`、`server/src/routes/index.ts`
- 要做：按 design 第 5 节端点实现；用 zod 校验 body。
- 验证：Supertest 打 `GET/PUT /api/family`、`GET/POST /api/members`、`PATCH/DELETE /api/members/:id`；空名字返回 400，删不存在的返回 404。

### T6：账户路由
- 文件：`server/src/routes/account.routes.ts`
- 验证：`GET/POST /api/accounts`；`PATCH /api/accounts/:id`；`POST /api/accounts/:id/set-default`；`PATCH /api/accounts/:id/calibrate`；删有交易的返回 409 且 `error.code === 'ACCOUNT_IN_USE'`。

---

## Phase 2 — E03 账目闭环（核心）

### T7：分类/来源服务
- 文件：`server/src/services/categories.ts`、`categories.test.ts`
- 要做：`listCategories(kind)`、`upsertCategory({kind, name})`——**已存在则直接返回原记录，不重复创建**。
- 验证：同名再创建返回同一 id；expense 与 income 同名互不冲突；空名报错。

### T8：账目写操作（余额联动 + 回滚）
- 文件：`server/src/services/ledger.ts`、`ledger.test.ts`
- 要做（全部同一事务）：
  - `createTransaction(input)`：
    - expense → `applyBalanceDelta(accountId, -amount)`
    - income → `+amount`
    - transfer → 转出 `-amount`、转入 `+amount`，校验两个账户不同且均存在
  - `updateTransaction(id, patch)`：**先完整回滚旧记录对账户的影响，再按新值应用**
  - `deleteTransaction(id)`：回滚账户影响；若 `source_type='repayment'` 抛 409
  - 金额 ≤ 0 抛 400
  - 保存后若账户余额为负，返回 `warnings: [{accountId, balanceYuan}]`
- 验证：三种类型对余额的影响；编辑后旧账户回滚、新账户生效；删除回滚；负余额产生 warning 但写入成功；转账同账户被拒。

### T9：账目查询与筛选
- 文件：`server/src/services/ledger.query.ts`、`ledger.query.test.ts`
- 要做：`listTransactions({month?, type?, accountId?, memberId?, page?, pageSize?})` 返回 `{items, page, pageSize, total, incomeTotalCents, expenseTotalCents, netCents}`。**排序：日期倒序，同日期按 created_at/id 倒序**。转账不计收支合计。默认本月。
- 验证：跨月数据只返回当月；四种筛选维度生效；合计正确且排除转账；分页 total 正确。

### T10：账目路由
- 文件：`server/src/routes/transaction.routes.ts`、`category.routes.ts`
- 验证：`POST /api/transactions` 三种类型；`GET` 带筛选与分页；`PATCH/DELETE`；删还款生成的支出返回 409（`error.code === 'GENERATED_BY_REPAYMENT'`）。

---

## Phase 3 — E04 资产

### T11：资产服务与路由
- 文件：`server/src/services/assets.ts`、`assets.test.ts`、`server/src/routes/asset.routes.ts`
- 要做：CRUD；`value_cents >= 0`；更新市值时刷新 `updated_at` 与 `updated_by_member_id`；删除走二次确认前的查询即可（后端直接删）。
- 验证：创建/编辑/删除；负值被拒；`updateAsset` 后 `updatedByMemberId` 正确；Supertest 覆盖 400/404。

---

## Phase 4 — E05 负债与还款（最易出错）

### T12：负债服务与路由
- 文件：`server/src/services/liabilities.ts`、`liabilities.test.ts`、`server/src/routes/liability.routes.ts`
- 要做：CRUD + `remaining >= 0`、`monthly >= 0`、还款日可空。
- 验证：基础 CRUD；负数被拒；创建时不要求账户存在（US-07 #7）。

### T13：还款服务（四步联动 + 反向回滚）
- 文件：`server/src/services/repayments.ts`、`repayments.test.ts`
- 要做（`createRepayment` 同一事务）：
  1. 校验还款金额 > 0 且 **不大于剩余本金**（否则 400）
  2. 取默认分类「其他」作为生成支出的 category
  3. 生成 `txn(type='expense', source_type='repayment', source_id=repayment.id, amount, occurred_on, account_id, note='还款 - {负债名}')`
  4. `account.balance_cents -= amount`；`liability.remaining_cents -= amount`
  5. 还款额未填时用该负债的 `monthly_payment_cents`；月供为 0 时必须手动输入
- `deleteRepayment(id)`：完整反向回滚——账户余额 `+amount`、负债本金 `+amount`、删除关联 txn、删除 repayment。
- `deleteLiability(id)`：**级联删除其全部还款记录并回滚**（确认过的 A4 方案）。
- 验证：一次还款后四项数据都正确；删除还款后完全回到初始状态；超额还款被拒；月供 0 时未填金额被拒；还款额度记录正确。

---

## Phase 5 — E06 净资产与分析

### T14：统计服务
- 文件：`server/src/services/stats.ts`、`stats.test.ts`
- 要做：
  - `summary()`：`totalAssetsCents = Σ account.balance + Σ asset.value`、`totalLiabilitiesCents = Σ liability.remaining`、`netWorthCents`、`monthlyPaymentTotalCents`、`accountsTotalCents`、`assetsTotalCents`
  - `monthlyTrend(months=6)`：`[{month:'2026-09', incomeCents, expenseCents, netCents}]`，升序；不足 6 个月的月份补 0；转账不计
  - `categoryBreakdown(month)`：`[{categoryId, name, cents, percent}]`，仅当月 expense（**含**还款生成的支出），按金额倒序
- 验证：口径公式与设计一致；转账不计入任何统计；还款支出计入支出；空数据返回空数组不报错；percent 合计 100（容差 0.01）。

### T15：统计路由
- 文件：`server/src/routes/stats.routes.ts`、`app.ts`（汇总所有路由）、`main.ts`（启动：openDb + ensureSeeded + listen 3001）
- 验证：`GET /api/stats/summary|monthly-trend|category-breakdown` 返回结构正确；`app.ts` 挂载后 Supertest 端到端跑一遍。

---

## Phase 6 — Web 前端（移动端优先）

### T16：API 客户端 + IndexedDB 读缓存
- 文件：`web/src/lib/idbCache.ts`、`web/src/lib/api.ts`、`web/src/lib/api.test.ts`
- 要做：`cachedGet<T>(url, maxAgeMs)`（SWR：先吐缓存再后台刷新，IndexedDB 不可用时静默降级）；`mutate(url, init)` 写操作成功后清除对应前缀缓存。API base 在 dev 下用 Vite proxy `/api`。
- 验证：mock IndexedDB 后验证缓存命中与失效；写后 GET 能拿到新值。

### T17：应用外壳与路由
- 文件：`web/index.html`、`web/vite.config.ts`（proxy `/api` → `localhost:3001`）、`web/src/main.tsx`、`web/src/App.tsx`、`web/src/styles.css`、五个 Tab 页占位
- 要做：底部五 Tab（记账/资产/负债/分析/设置），桌面居中限宽 480px，粉色主色调。
- 验证：`App.test.tsx` 渲染后五个 Tab 均可见，切换 Tab 内容切换。

### T18：设置页（家庭 + 成员）
- 文件：`web/src/features/settings/SettingsPage.tsx` 等
- 验证：家庭名可改；成员可增改删；改名即时生效。

### T19：资产页（账户 + 资产项）
- 文件：`web/src/features/assets/*`
- 验证：总资产卡正确（= 账户合计 + 资产合计）；新增账户/资产；校准余额；负余额红色提示；有交易账户删除按钮禁用。

### T20：记账页（列表 + 筛选 + 记一笔）
- 文件：`web/src/features/accounting/*`
- 验证：默认本月、日期倒序；可见日期/类型/金额/分类/账户/成员/备注；四种筛选生效并显示三项合计；「记一笔」默认今天 + 默认账户 + 默认分类 + 默认成员「我」；内联新建分类后自动选中；删除二次确认。

### T21：负债页（负债 + 还款）
- 文件：`web/src/features/liabilities/*`
- 验证：总负债与月供合计正确；「还一笔」默认带出月供；还款后列表与分析页数据刷新。

### T22：分析页（三个手写 SVG 图表）
- 文件：`web/src/features/analysis/*`（`BarTrend.tsx` 柱状图、`DonutBreakdown.tsx` 环形图用 `stroke-dasharray`、`StatCard.tsx`）
- 验证：净资产三数字正确；无数据时显示空状态不报错；图表元素数量与数据一致。

---

## Phase 7 — 收尾

### T23：全链路冒烟
- 手动脚本 `server/src/smoke.test.ts`：按 US-01→US-09 顺序走一遍（初始化 → 开户 → 记三笔 → 转账 → 建资产 → 建负债 → 还款 → 查净资产与图表），断言每一步的派生数据。
- 验证：全绿 + `npm run typecheck` 无错。

### T24：代码评审与清理
- 逐阶段评审；确认无绕过 ledger 的写路径。
