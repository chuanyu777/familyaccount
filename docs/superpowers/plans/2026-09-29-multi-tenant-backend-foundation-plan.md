# Multi-Tenant Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-family Spring Boot backend with a multi-tenant ledger API that supports WeChat users, pre-provisioned Web users, platform read-only access, invitations, and the approved ledger permissions.

**Architecture:** Keep one Spring Boot application, one JdbcTemplate-based persistence style, and one database. Replace the global `family`/`member` assumption with `app_user`, `ledger`, and `ledger_membership`; make every business query ledger-scoped and authorize it through a request principal. Expose separate authentication principals for Mini Program users, special-ledger Web users, and platform administrators.

**Tech Stack:** Java 17, Spring Boot 3.3.5, Spring Web, Spring JDBC, MySQL 8, H2 MySQL-compatible tests, JUnit 5, MockMvc, custom SQL migrations and JdbcTemplate transactions.

**Spec:** `docs/superpowers/specs/2026-09-29-multi-tenant-ledger-and-mini-program-design.md`

## Global Constraints

- The tenant is `Ledger`; do not introduce a `Family` domain entity.
- Ledger roles are only `OWNER` and `MEMBER`; do not add `LedgerAdmin`.
- All business records are ledger-scoped and server-side membership checks are mandatory.
- No historical single-ledger data migration is required; deployment starts with a fresh schema.
- Ordinary users authenticate only through WeChat in the MVP.
- Web ledger credentials and platform administrator credentials are pre-provisioned username/password credentials.
- Only one fixed ledger is Web-enabled.
- Owner is fixed; MVP has no ownership transfer and no ledger deletion.
- Use transactions for every balance-affecting mutation.
- A regular member may edit/delete only their own transactions and repayments; owner may edit/delete all.
- Shared accounts, assets, liabilities, snapshots, and categories are never physically deleted; only owner can archive or restore them.

---

### Task 1: Replace the Single-Tenant Schema and Seed Model

**Files:**
- Modify: `backend/src/main/resources/schema.sql`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/java/com/familyledger/db/Seeder.java`
- Modify: `backend/src/test/java/com/familyledger/TestDb.java`
- Modify: `backend/src/test/java/com/familyledger/SmokeTest.java`
- Modify: `backend/src/test/java/com/familyledger/MigratorTest.java`
- Modify: `backend/src/main/resources/db/migration/V2__repayment_category.sql`
- Test: `backend/src/test/java/com/familyledger/SchemaSeedTest.java`

**Interfaces:**
- Produces the tables and seed fixtures consumed by every later task.
- `Seeder.ensureSeeded()` remains idempotent and creates the fixed special ledger, one platform administrator, two Web users, and their memberships from secure configuration.
- `TestDb.reset(JdbcTemplate)` drops and recreates the new tables in foreign-key-safe order.

- [ ] **Step 1: Write the failing schema/seed tests**

Add `SchemaSeedTest` with tests named `createsLedgerScopedTables`,
`seedsOneSpecialLedgerAndTwoWebUsers`, and `seedIsIdempotent`. Assert the
presence of `app_user`, `ledger`, `ledger_membership`, `ledger_invitation`,
`web_credential`, `platform_admin`, and `web_binding_code`; assert the special
ledger has one owner and one member; call `Seeder.ensureSeeded()` twice and
assert no duplicate usernames or memberships.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd backend && mvn -q -Dtest=SchemaSeedTest test`

Expected: FAIL because the old `family`/`member` schema has none of the new
tables.

- [ ] **Step 3: Replace the schema**

Create fresh-schema tables with these required columns and constraints:

```sql
app_user(id, display_name, created_at)
wechat_identity(id, user_id UNIQUE, openid UNIQUE, created_at)
web_credential(id, user_id UNIQUE, username UNIQUE, password_hash, enabled, created_at)
platform_admin(id, username UNIQUE, password_hash, enabled, created_at)
ledger(id, name, is_web_enabled, created_by_user_id, created_at)
ledger_membership(id, ledger_id, user_id, role, web_login_allowed, active, joined_at)
ledger_invitation(id, ledger_id, created_by_user_id, token_hash UNIQUE, expires_at, revoked_at, accepted_at, created_at)
web_binding_code(id, user_id, code_hash UNIQUE, expires_at, used_at, created_at)
account(id, ledger_id, name, balance_cents, is_default, archived, created_at)
category(id, ledger_id, kind, name, archived, created_at)
txn(id, ledger_id, type, amount_cents, occurred_on, note, account_id, to_account_id, category_id, created_by_user_id, source_type, source_id, created_at)
asset(id, ledger_id, name, value_cents, kind, archived, updated_at)
liability(id, ledger_id, name, remaining_cents, monthly_payment_cents, payment_day, archived, created_at)
repayment(id, ledger_id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_by_user_id, created_at)
asset_snapshot(id, ledger_id, asset_id, snap_month, value_cents, note, recorded_at)
```

Use composite uniqueness for ledger-scoped names and active memberships,
foreign keys for same-ledger references where practical, and no `member_id`
columns. Keep amounts as `BIGINT` cents and timestamps as the project’s
`VARCHAR(19)` format. Keep the existing V1 baseline convention, but document
that old deployed data is outside this rollout; the fresh `schema.sql` is the
source of the new baseline and V2 must remain harmless on a fresh database.

- [ ] **Step 4: Implement deterministic seed configuration**

Add explicit configuration properties for the platform admin username/password,
special ledger name, owner Web username/password, and member Web
username/password. `Seeder` must hash passwords before insertion, insert the
two users and memberships with `web_login_allowed = 1`, and return immediately
without duplicating rows when the seed already exists.

- [ ] **Step 5: Update test reset and migration fixtures**

Update `TestDb.TABLES` and reset logic for every new table. Update the migration
fixture so the repayment category statement includes `ledger_id` and is safe
when the fresh seed has already created the category. Remove assertions that
expect `family` or manual `member` rows.

- [ ] **Step 6: Run the schema tests and the full backend suite**

Run: `cd backend && mvn -q -Dtest=SchemaSeedTest,MigratorTest,SmokeTest test`

Expected: PASS, with seed idempotency and no old single-family assumptions.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/schema.sql backend/src/main/resources/application.yml backend/src/main/java/com/familyledger/db/Seeder.java backend/src/test/java/com/familyledger/TestDb.java backend/src/test/java/com/familyledger/SchemaSeedTest.java backend/src/test/java/com/familyledger/SmokeTest.java backend/src/test/java/com/familyledger/MigratorTest.java backend/src/main/resources/db/migration/V2__repayment_category.sql
git commit -m "feat: establish multi-tenant ledger schema"
```

### Task 2: Add Authentication Principals and Sessions

**Files:**
- Create: `backend/src/main/java/com/familyledger/auth/AuthPrincipal.java`
- Create: `backend/src/main/java/com/familyledger/auth/PrincipalType.java`
- Create: `backend/src/main/java/com/familyledger/auth/PasswordHasher.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthConfig.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthSession.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthGuard.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthWebConfig.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthController.java`
- Create: `backend/src/main/java/com/familyledger/auth/AuthService.java`
- Modify: `backend/pom.xml`
- Delete or retire: `backend/src/main/java/com/familyledger/access/AccessConfig.java`, `AccessController.java`, `AccessGuard.java`, `AccessSession.java`, `AccessWebConfig.java`, `ClientIp.java`, `FailedAttemptLimiter.java`, `FailedAttemptLimiterBean.java`
- Test: `backend/src/test/java/com/familyledger/auth/AuthControllerTest.java`
- Test: `backend/src/test/java/com/familyledger/auth/AuthSessionTest.java`

**Interfaces:**
- `AuthService.authenticateWeb(String username, String password): AuthPrincipal`
- `AuthService.authenticatePlatformAdmin(String username, String password): AuthPrincipal`
- `AuthService.loginWeChat(String wxLoginCode): AuthPrincipal`
- `AuthService.issueWebBindingCode(long userId): String`
- `AuthService.bindWeChatIdentity(long userId, String code, String openid): AuthPrincipal`
- `AuthPrincipal` carries `PrincipalType`, `userId` for ledger users, and `platformAdminId` for platform admins.
- `AuthGuard.currentPrincipal(HttpServletRequest): AuthPrincipal` is the only controller/service entry point for the authenticated subject.

- [ ] **Step 1: Write failing authentication tests**

Cover successful and failed Web credential login, platform-admin isolation,
expired Web sessions, WeChat identity creation, binding-code single use,
expired binding codes, and rejection when the WeChat identity is already bound.
Use `MockMvc` and inject a deterministic `WeChatClient` fake rather than call
the real WeChat service.

- [ ] **Step 2: Add password hashing and signed session cookies**

Add the smallest password-hashing dependency needed for a standard adaptive
hash, configure separate cookie names for platform and ledger Web sessions,
and implement expiry, invalid signature rejection, logout, and generic login
failure responses. Do not store credentials or session state in local storage.

- [ ] **Step 3: Add WeChat identity exchange behind an interface**

Create `WeChatClient.exchangeLoginCode(String code): WeChatIdentity` and a
production implementation using configured Mini Program credentials. In tests,
use a fake implementation returning a deterministic `openid`. `loginWeChat`
creates a user only when the identity is unknown; it never merges users.

- [ ] **Step 4: Implement optional Web binding codes**

Generate a cryptographically random code, store only its hash with a short
expiry, mark it used in the same transaction as the identity binding, and
reject codes that are expired, already used, or attached to an already-bound
user. Rate-limit invalid attempts and return generic errors.

- [ ] **Step 5: Replace the old shared access-code guard**

Remove the `family_access` trust-device gate from protected business APIs.
Register an interceptor that distinguishes `/api/auth/**`, `/api/platform/**`,
and `/api/**`, attaches `AuthPrincipal` to the request, and never lets a
platform session satisfy a ledger-user endpoint or vice versa.

- [ ] **Step 6: Run focused and full backend tests**

Run: `cd backend && mvn -q -Dtest='com.familyledger.auth.**' test`

Then run: `cd backend && mvn -q test`

- [ ] **Step 7: Commit**

```bash
git add backend/pom.xml backend/src/main/java/com/familyledger/auth backend/src/main/java/com/familyledger/access backend/src/test/java/com/familyledger/auth
git commit -m "feat: add unified user authentication"
```

### Task 3: Implement Ledger Context, Membership, Invitations, and Owner Rules

**Files:**
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerContext.java`
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerAuthorization.java`
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerController.java`
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerService.java`
- Create: `backend/src/main/java/com/familyledger/ledger/InvitationController.java`
- Create: `backend/src/main/java/com/familyledger/ledger/InvitationService.java`
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerMembershipController.java`
- Create: `backend/src/main/java/com/familyledger/ledger/LedgerMembershipService.java`
- Modify: `backend/src/main/java/com/familyledger/controller/FamilyController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/MemberController.java`
- Delete or retire: `backend/src/main/java/com/familyledger/service/FamilyService.java`, `MemberService.java`
- Test: `backend/src/test/java/com/familyledger/ledger/LedgerAuthorizationTest.java`
- Test: `backend/src/test/java/com/familyledger/ledger/InvitationControllerTest.java`

**Interfaces:**
- `LedgerAuthorization.requireMembership(AuthPrincipal principal, long ledgerId): LedgerContext`
- `LedgerAuthorization.requireOwner(AuthPrincipal principal, long ledgerId): LedgerContext`
- `LedgerAuthorization.requireCreatorOrOwner(AuthPrincipal principal, long ledgerId, long createdByUserId): LedgerContext`
- `LedgerService.createLedger(long userId, String name): LedgerSummary`
- `LedgerService.listForUser(long userId): List<LedgerSummary>`
- `InvitationService.create(long ownerId, long ledgerId): InvitationView`
- `InvitationService.accept(long userId, String rawToken): LedgerMembershipView`
- `InvitationService.revoke(long ownerId, long invitationId): void`
- `LedgerMembershipService.remove(long ownerId, long membershipId): void`
- `LedgerMembershipService.leave(long userId, long ledgerId): void`

- [ ] **Step 1: Write failing isolation and membership tests**

Create two users and two ledgers in test fixtures. Assert a user can read only
ledgers where an active membership exists, a member cannot call owner-only
operations, the owner cannot remove itself, and leaving/removal does not delete
business rows.

- [ ] **Step 2: Implement ledger creation and initialization**

Create the ledger, owner membership, zero-balance default account, and base
income/expense categories in one transaction. Return the new ledger as the
current ledger candidate. Never copy data from another ledger.

- [ ] **Step 3: Implement invitation tokens and acceptance**

Create a 32-byte random token, store its hash, set `expires_at` to seven days,
and return the raw token only on creation. On acceptance, lock the invitation
row, reject revoked/expired/accepted tokens, create an active member
membership, and mark the invitation accepted in one transaction.

- [ ] **Step 4: Implement owner membership operations**

Allow only the owner to revoke invitations, remove members, and update ledger
name. Prevent removal of the owner. Allow a member to leave and reject owner
leave. Do not implement ownership transfer or ledger deletion.

- [ ] **Step 5: Run focused tests**

Run: `cd backend && mvn -q -Dtest='com.familyledger.ledger.**' test`

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/familyledger/ledger backend/src/main/java/com/familyledger/controller/FamilyController.java backend/src/main/java/com/familyledger/controller/MemberController.java backend/src/main/java/com/familyledger/service/FamilyService.java backend/src/main/java/com/familyledger/service/MemberService.java backend/src/test/java/com/familyledger/ledger
git commit -m "feat: add ledger membership and invitations"
```

### Task 4: Scope Existing Business Services and Enforce Record Ownership

**Files:**
- Modify: `backend/src/main/java/com/familyledger/service/LedgerService.java`
- Modify: `backend/src/main/java/com/familyledger/service/LedgerQueryService.java`
- Modify: `backend/src/main/java/com/familyledger/service/AccountService.java`
- Modify: `backend/src/main/java/com/familyledger/service/AssetService.java`
- Modify: `backend/src/main/java/com/familyledger/service/LiabilityService.java`
- Modify: `backend/src/main/java/com/familyledger/service/RepaymentService.java`
- Modify: `backend/src/main/java/com/familyledger/service/CategoryService.java`
- Modify: `backend/src/main/java/com/familyledger/service/StatsService.java`
- Modify: `backend/src/main/java/com/familyledger/controller/AccountController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/AssetController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/LiabilityController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/RepaymentController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/CategoryController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/StatsController.java`
- Modify: `backend/src/main/java/com/familyledger/controller/TransactionController.java`
- Test: `backend/src/test/java/com/familyledger/LedgerIsolationFlowTest.java`
- Test: `backend/src/test/java/com/familyledger/RecordPermissionTest.java`

**Interfaces:**
- Every service method that reads or writes a business object accepts `LedgerContext` or `ledgerId` plus `AuthPrincipal`; no service queries a table without a ledger predicate.
- `LedgerService.createTransaction(AuthPrincipal principal, LedgerContext ledger, TransactionInput input): TransactionResult`
- `LedgerService.updateTransaction(AuthPrincipal principal, LedgerContext ledger, long id, TransactionPatch patch): TransactionResult`
- `LedgerService.deleteTransaction(AuthPrincipal principal, LedgerContext ledger, long id): void`
- `RepaymentService.create(AuthPrincipal principal, LedgerContext ledger, RepaymentInput input): RepaymentView`
- `RepaymentService.update(AuthPrincipal principal, LedgerContext ledger, long id, RepaymentPatch patch): RepaymentView`
- `RepaymentService.delete(AuthPrincipal principal, LedgerContext ledger, long id): void`
- Shared-resource services expose `archive` and `restore` only after `requireOwner`.

- [ ] **Step 1: Write failing cross-ledger tests**

Seed identical IDs in two ledgers and assert every list, get, update, delete,
statistics, snapshot, and repayment query returns only the current ledger's
rows. Assert forged IDs from another ledger return not-found or forbidden and
never mutate the other ledger.

- [ ] **Step 2: Remove legacy member attribution**

Remove `memberId` request fields and member selectors from transaction,
account, asset, liability, and repayment services. Set `created_by_user_id`
from the authenticated principal for transactions and repayments. Keep
repayment-generated transactions linked through `source_type/source_id` and
make them non-editable directly.

- [ ] **Step 3: Add creator-or-owner authorization**

Before transaction or repayment update/delete, load the record within the
current ledger and call `requireCreatorOrOwner`. Keep all active members able
to create and view records. Reject member edits/deletes of another creator
with a stable forbidden error. The repayment update path must reverse the old
account/liability effects, validate the new liability/account/amount, apply the
new effects, and update the linked generated transaction atomically.

- [ ] **Step 4: Add shared-resource archive/restore**

Replace physical deletes for account, asset, liability, and category with
`archived = true/false`. Reject archived resources in new transaction,
snapshot, and repayment validation. Preserve archived references in reads.

- [ ] **Step 5: Preserve atomic balance behavior**

Keep `@Transactional` around transaction and repayment mutations. Ensure
ledger predicates are present before balance changes, and use the existing
reverse mutation paths for delete. Add explicit tests that a failed validation
does not change any balance or liability amount.

- [ ] **Step 6: Run the business integration suite**

Run: `cd backend && mvn -q -Dtest=LedgerIsolationFlowTest,RecordPermissionTest,SmokeTest test`

Then run: `cd backend && mvn -q test`

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/familyledger/service backend/src/main/java/com/familyledger/controller backend/src/test/java/com/familyledger/LedgerIsolationFlowTest.java backend/src/test/java/com/familyledger/RecordPermissionTest.java
git commit -m "feat: enforce ledger isolation and record ownership"
```

### Task 5: Add Platform Read-Only Queries and Special Web Authorization

**Files:**
- Create: `backend/src/main/java/com/familyledger/platform/PlatformAdminController.java`
- Create: `backend/src/main/java/com/familyledger/platform/PlatformAdminQueryService.java`
- Create: `backend/src/main/java/com/familyledger/ledger/WebLedgerAuthorization.java`
- Modify: `backend/src/main/java/com/familyledger/ledger/LedgerAuthorization.java`
- Modify: `backend/src/main/java/com/familyledger/auth/AuthService.java`
- Test: `backend/src/test/java/com/familyledger/platform/PlatformAdminControllerTest.java`
- Test: `backend/src/test/java/com/familyledger/ledger/SpecialWebLedgerTest.java`

**Interfaces:**
- `PlatformAdminQueryService.listLedgers(String query): List<LedgerSummary>`
- `PlatformAdminQueryService.readLedger(long ledgerId): PlatformLedgerView`
- `WebLedgerAuthorization.requireSpecialLedger(AuthPrincipal principal): LedgerContext`

- [ ] **Step 1: Write failing platform and special-ledger tests**

Assert a platform session can list/open any ledger and read all approved data,
but receives forbidden for every POST/PATCH/DELETE business route. Assert a
pre-provisioned Web credential can log in only when its active membership is
the fixed Web-enabled ledger; a normal user's Web credential or a different
ledger receives forbidden.

- [ ] **Step 2: Implement platform read models**

Add read-only endpoints for ledger list/search and ledger detail views. Reuse
ledger-scoped query helpers with an explicit platform read principal rather
than bypassing SQL predicates. Do not expose mutation service methods through
these controllers.

- [ ] **Step 3: Enforce special Web ledger access**

Require the authenticated user to have an active membership with
`web_login_allowed = 1` in the single `is_web_enabled` ledger. Ignore or
reject arbitrary ledger IDs from the Web client and return the configured
special ledger context.

- [ ] **Step 4: Run focused tests and commit**

Run: `cd backend && mvn -q -Dtest='com.familyledger.platform.**,com.familyledger.ledger.SpecialWebLedgerTest' test`

```bash
git add backend/src/main/java/com/familyledger/platform backend/src/main/java/com/familyledger/ledger backend/src/main/java/com/familyledger/auth/AuthService.java backend/src/test/java/com/familyledger/platform backend/src/test/java/com/familyledger/ledger/SpecialWebLedgerTest.java
git commit -m "feat: add platform read access and special web ledger"
```

### Task 6: Finish Backend Contract Tests and Deployment Configuration

**Files:**
- Modify: `backend/src/test/java/com/familyledger/SmokeTest.java`
- Modify: `backend/src/test/resources/application-test.yml`
- Modify: `backend/README.md`
- Modify: `deploy/README.md`
- Modify: `deploy/docker-compose.prod.yml`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/familyledger/ContractFlowTest.java`

**Interfaces:**
- The final HTTP contract exposes auth, ledger, invitation, membership,
  platform read, and all existing ledger business endpoints with current-ledger authorization.

- [ ] **Step 1: Write the end-to-end contract flow**

In `ContractFlowTest`, exercise: normal WeChat login, ledger creation,
default seed rows, invitation creation/acceptance, second-ledger isolation,
member-owned transaction permissions, owner override, archive validation,
special Web login/binding, and platform read-only access.

- [ ] **Step 2: Configure secure seed values for local/test environments**

Document non-production defaults only in test configuration. Production values
must be injected through environment or deployment secrets; never commit real
passwords. Replace the old shared `FAMILY_ACCESS_CODE` documentation with the
new platform/Web credential variables and WeChat Mini Program settings.

- [ ] **Step 3: Run all backend verification**

Run: `cd backend && mvn -q test`

Expected: all existing business tests are updated to the new ledger-scoped
contract and all new isolation/auth tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test backend/src/main/resources/application.yml backend/src/main/resources/schema.sql backend/README.md deploy/README.md deploy/docker-compose.prod.yml
git commit -m "test: verify multi-tenant backend contract"
```

## Backend Completion Check

Run from the repository root:

```bash
cd backend && mvn -q test
```

The backend is ready for client work only when all cross-ledger, authorization,
binding, archive, and balance tests pass against the fresh schema.
