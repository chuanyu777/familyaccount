# 家庭记账簿 · 代码现状总览

> **历史文档提示（2026-09-30）：** 本文记录的是旧单家庭/共享访问口令版本，已被当前多租户后端取代。当前实现请以 `backend/README.md` 和 `deploy/README.md` 为准；本文中的 `FAMILY_ACCESS_CODE`、`AccessGuard`、`/api/access/*` 和 `/api/family` 不可用于当前部署。

> **本文档是「代码事实基线」**：只记录当前工作区真实存在的行为。写新计划前先读这里，不要拿旧设计稿当现状。
> 与本文档冲突的其他文档，以本文档为准。

**架构口径（本次清理后）**：**Spring Boot + Vue 3 + MySQL**。原 Node/Express + SQLite 后端 `server/`
已整体删除（能力全部由 `backend/` 承接，含家庭访问控制）；如需回溯，见备份分支
`backup/before-server-removal`。

---

## 1. 仓库里有什么

| 目录 | 技术栈 | 职责 |
| --- | --- | --- |
| `backend/` | Java 17 + Spring Boot 3.3.5 + Spring JDBC(JdbcTemplate) + MySQL 8 | **唯一后端**：业务接口 + 家庭访问控制 |
| `web/` | Vue 3.5 + Vite 6 + TypeScript | 移动端优先 SPA，无 `vue-router`、无 Pinia，hash 路由为自实现 |
| `deploy/` | Docker Compose + Nginx + 备份/恢复脚本 | 生产部署拓扑与运维脚本 |
| `docs/` | Markdown | 设计、计划与本现状文档 |
| 根目录 | `package.json` / `tsconfig.json` / `vitest.workspace.ts` | 仅服务前端（构建、测试、类型检查） |

### 1.1 运行与验证

```bash
# 前端（端口 5173，/api 由 vite proxy 转发到 localhost:3001）
npm install
npm run dev
npm test               # vitest run，仅 web project
npm run typecheck      # vue-tsc --noEmit
npm run build          # 构建 web/dist

# 后端（端口 3001，需 JDK 17+ / Maven）
cd backend && mvn -s mvn-settings.xml spring-boot:run
cd backend && mvn -s mvn-settings.xml test        # H2 内存库跑全部测试
cd backend && docker compose up --build           # app:3001 + MySQL:3306
```

测试规模：后端 **30 个用例**（含 `SmokeTest` 全链路冒烟、`AccessControllerTest`、`AccessSessionTest`、
`MigratorTest`、`MoneyTest`、`MonthUtilTest`）；前端 **20 个测试文件、254 个用例**。

> 注意：前端测试在本机沙箱里偶发少收集文件（文件系统 shim 报错），被收集到的用例全部通过；
> 单独跑 `web/src/features/assets/AssetsPage.test.ts` 41 个用例全绿。CI 环境应无此问题。

### 1.2 数据落在哪

MySQL 8，库名默认 `family_ledger`，环境变量 `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
（`backend/src/main/resources/application.yml`）。建表走 `spring.sql.init` + `classpath:schema.sql`，
结构演进走自研 `Migrator` + `db/migration/V*.sql` + `schema_migration` 版本表（含校验和防篡改，
详见 `backend/MIGRATIONS.md`）。

---

## 2. 数据模型（`backend/src/main/resources/schema.sql`）

金额一律 `BIGINT` 存「分」，对外 JSON 输出元的字符串（`"12.34"`），转换只走 `common/Money`。
单家庭：`family` 恒一行（`id = 1`）。时间戳统一 `VARCHAR(19)`（`'YYYY-MM-DD HH:MM:SS'`），由应用层写入。

| 表 | 说明 |
| --- | --- |
| `family` / `member` | 家庭（单行）与成员 |
| `account` | 资金账户：`balance_cents`、`member_id`(NULL=家庭共有)、`is_default`（唯一） |
| `category` | `kind('expense'\|'income')`、name、`UNIQUE(kind, name)`。**只有 4 列**——没有 `is_archived`/`is_pinned`（分类管理尚未实现） |
| `txn` | 账目主表（**表名是 `txn`**）：`type(expense\|income\|transfer)`、`amount_cents`、`occurred_on`、`account_id`、`to_account_id`、`category_id`、`member_id`、`source_type('manual'\|'repayment')`、`source_id` |
| `asset` / `asset_snapshot` | 资产项与月度市值快照（快照列名为 `snap_month`，`UNIQUE(asset_id, snap_month)`） |
| `liability` / `repayment` | 负债与还款（还款关联自动生成的支出 `transaction_id`） |
| `schema_migration` | 迁移版本表（`version`/`name`/`checksum`/`applied_at`/`execution_ms`） |

派生口径（唯一公式）：
- 总资产 = `Σ account.balance_cents` + `Σ asset.value_cents`；总负债 = `Σ liability.remaining_cents`；净资产 = 总资产 − 总负债
- 月供合计 = `Σ liability.monthly_payment_cents`
- 当月结余 = 当月 income − 当月 expense（**含**还款生成的支出，**不含**转账）

---

## 3. 已实现的能力

| 领域 | 行为 |
| --- | --- |
| 账目 | 支出/收入/转账三种；转账双向改余额且不计收支；编辑先回滚旧影响再应用新值；删除完整回滚；`source_type='repayment'` 的支出禁止改删（409 `GENERATED_BY_REPAYMENT`）；余额可为负，响应带 `warnings` |
| 账户 | CRUD、唯一默认账户、余额校准；有交易的账户删除返回 409 `ACCOUNT_IN_USE`（带笔数） |
| 资产 | CRUD + 月度市值快照（当前月写入即刷新市值，历史月为补录，未来月 400 `FUTURE_MONTH`）；资产不影响账户余额 |
| 负债与还款 | 还款在 `@Transactional` 内完成「写还款 → 生成支出（归入「还款」分类）→ 扣账户余额 → 减本金」；删除还款完整反向回滚；删除负债级联回滚其全部还款；还款额不得大于剩余本金 |
| 统计 | `/api/stats/summary`、`monthly-trend`、`category-breakdown`、`monthly-snapshot`（历史资产无快照时回退当前市值并标 `assetsEstimated`） |
| 家庭与成员 | 家庭改名；成员增删改（删除后其名下账目/资产/负债转为「家庭共有」） |
| 分类 | 目前只有按 kind 列出与 upsert（同名复用），**无重命名/置顶/归档/删除** |
| 前端 | 5 个 Tab（记账/资产/负债/分析/设置），hash 路由 `#accounting…#settings`；IndexedDB 做 GET 读缓存（SWR，5s 新鲜期，写操作后按前缀失效）；设置页可改家庭名、管理成员 |

### 3.1 家庭访问控制（`com.familyledger.access`）

| 项 | 值 |
| --- | --- |
| 代码位置 | `AccessConfig`、`AccessSession`、`FailedAttemptLimiter`、`ClientIp`、`AccessController`、`AccessGuard`、`AccessWebConfig`；健康检查在 `controller/HealthController` |
| 环境变量 | `FAMILY_ACCESS_CODE`、`SESSION_SECRET`、`TRUST_PROXY_HOPS`（非负整数，默认 0）；生产判定用 Spring profile `prod`/`production`（`SPRING_PROFILES_ACTIVE`） |
| 启用条件 | `enabled = 生产 profile \|\| 配了口令` |
| 生产 fail-fast | `AccessConfig` 的 `@PostConstruct` 校验：生产 profile 下缺任一密钥，Spring 容器启动失败 |
| 会话 | `base64url({exp})` + HMAC-SHA256 签名，TTL **30 天**；口令比对先 sha256 再常量时间比较 |
| Cookie | `family_access`：`Path=/; HttpOnly; SameSite=Strict`，生产追加 `Secure` |
| 公开端点 | `POST /api/access/unlock`、`POST /api/access/lock`、`GET /api/access/session`、`GET /healthz`（204） |
| 受保护 | 其余全部 `/api/**`（`AccessGuard` 拦截器，排除 `/api/access/**`）；未认证返回 401 `ACCESS_REQUIRED` |
| 限流 | 同一客户端 IP 滚动 15 分钟内 5 次失败 → 429 `TOO_MANY_ATTEMPTS`（进程内内存，重启清零，多实例不共享） |
| 代理 | `TRUST_PROXY_HOPS > 0` 时从 `X-Forwarded-For` 由右往左取第 N 跳；部署在单层 Nginx 后必须设为 `1` |

前端链路不变：`web/src/lib/api.ts` 收到 401 派发 `family-access-lost` → `App.vue` 跳转
`/unlock.html?next=<encodeURIComponent(hash)>`；`web/public/unlock.html` 提交到 `/api/access/unlock`，
成功后 `location.replace('/' + next)`（`next` 必须以单个 `#` 开头，否则回落首页）。

---

## 4. 前端结构

- 入口 `web/src/main.ts` 仅挂载 `App.vue`，无 router/store 注册；Tab 见 `web/src/app/tabs.ts`，路由逻辑见 `web/src/composables/useHashTab.ts`。
- 页面：`features/accounting`（流水 + 筛选 + 记一笔 + 详情/编辑/删除）、`features/assets`（账户 + 资产 + 市值快照）、`features/liabilities`（负债 + 还一笔）、`features/analysis`（手写 SVG 图表）、`features/settings`（家庭名 + 成员）。
- 公共组件 `web/src/components/`：`AppShell`、`DesktopNav`、`MobileNav`、`PageHeader`、`AppSheet`、`ConfirmDialog`、`MonthPicker`、`SummaryStrip`、`AsyncState`、`AppToast`。
- 样式：`web/src/styles/base.css` 定义全部设计令牌（`@layer base, components`），其余为组件内 `<style scoped>`。
- 缓存/失效：`lib/idbCache.ts`（IndexedDB KV，缺失时静默降级）、`resourceInvalidation.ts`、`latestGate.ts`（竞态闸门）。

---

## 5. 部署现状（`deploy/`）

```
浏览器 → web 容器(Nginx :80) ──/api/──▶ app 容器(Spring Boot :3001) ──▶ MySQL 8
```

- `docker-compose.prod.yml`：`mysql:8.0`（不暴露端口）+ `app`（`build.context: ../backend`，注入
  `SPRING_PROFILES_ACTIVE=prod`、`FAMILY_ACCESS_CODE`、`SESSION_SECRET`、`TRUST_PROXY_HOPS=1`）+ `web`
  （`Dockerfile.web`，80:80）。`mysql-data` 卷，`down -v` 会删库。
- `nginx.conf`：仅 `listen 80`；`/assets/` 缓存 30 天；`/api/` 反代 `app:3001` 并转发
  `X-Forwarded-For`/`X-Real-IP`/`X-Forwarded-Proto`；SPA 回退。**无 HTTPS 重定向、无 `auth_request`**。
- 备份恢复（仓库根目录执行）：`./deploy/backup.sh`（mysqldump+gzip → `backups/`，`KEEP_DAYS` 默认 14）；
  `./deploy/restore.sh <备份文件>`（需输入字面量 `yes`，先自动备份当前库并停 `app`）。

---

## 6. 已知偏差与待办（按影响排序）

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | 分类管理未实现 | `category` 表无 `is_archived`/`is_pinned`；`CategoryService` 只有 upsert/ensureDefault；`CategoryController` 只有 `GET`/`POST`；前端无 `CategoryPicker.vue`、`CategoryManager.vue`。见 `docs/superpowers/plans/2026-09-22-category-management-and-picker.md`（Task 1–5 全部未开始；注意该计划写的是 Node 文件路径，落地时需改成 Java + `V3__*.sql` 迁移） |
| 2 | 当前分类选择器是「全量平铺」 | `TransactionForm.vue` 4 列宫格渲染该 kind 的全部分类 + 「＋ 新分类」，无 6 槽上限、无「全部」抽屉、无搜索、无置顶/最近使用排序 |
| 3 | Nginx 未做强制拦截 | 无 `auth_request`，未解锁时仍可下载 SPA 包，只有页面加载后接口 401 才跳解锁页；也无 HTTPS 重定向（建议由负载均衡/CDN 终止 TLS） |
| 4 | 「锁定本设备」无入口 | 后端 `POST /api/access/lock` 已就绪，前端没有任何地方调用它 |
| 5 | 视觉改版方向（原 design-v2「燕麦焦糖」）已归档 | `base.css` 仍是 C3「Ultramarine Signal」（`--primary #3159d7`），`--font-serif` 被退化成黑体栈。那份仅落地于文档、从未实现的视觉稿已删除；需要时从 git 历史取回：`git show b080ad9:docs/design-v2.md` |
| 6 | 前端测试在本机沙箱偶发少收集文件 | 与代码无关的环境现象（文件系统 shim 报错），CI 上未复现；被收集到的用例全绿 |
| 7 | 仓库无根目录 README | 新人无法从入口了解架构与启动方式 |

---

## 7. 文档索引

| 文档 | 性质 | 状态 |
| --- | --- | --- |
| `docs/status.md`（本文） | 代码事实基线 | 随代码更新 |
| `docs/design.md` | 总体设计 | 有效（Spring Boot + Vue 口径） |
| `docs/superpowers/specs/2026-09-18-vue-frontend-redesign-design.md` | 前端重构规格 | 已落地（视觉部分除外），**当前视觉基线** |
| `docs/plan.md` | MVP 初始实施计划 | **历史归档**（React 版，已被取代） |
| `docs/superpowers/specs/2026-09-18-vue-frontend-redesign-design.md` | 前端重构规格 | 已落地（视觉部分除外） |
| `docs/superpowers/specs/2026-09-22-access-control-and-category-management-design.md` | 访问控制 + 分类管理规格 | 访问控制已由 Spring Boot 落地；分类管理未开始 |
| `docs/superpowers/plans/2026-09-19-vue-frontend-redesign.md` | 前端重构实施计划 | 已随 PR #1（`3ce06d2`）合并 |
| `docs/superpowers/plans/2026-09-22-household-access-control.md` | 访问控制实施计划 | Task 1–3 已完成（能力现由 `backend/` 承接）；Task 4–5 未开始 |
| `docs/superpowers/plans/2026-09-22-category-management-and-picker.md` | 分类管理实施计划 | 全部未开始（文件路径需改为 Java） |
