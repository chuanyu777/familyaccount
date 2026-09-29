# Web Platform and Special Ledger Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing Vue Web app into two explicit surfaces: a read-only platform operations console and a full-featured Web client for the one pre-provisioned special ledger.

**Architecture:** Keep Vue 3, TypeScript, and Vite. Select the Web surface from the pathname before mounting: `/platform` mounts the platform console and `/ledger` mounts the special-ledger bookkeeping shell. Both use the same API module but separate authentication sessions and response contracts; the existing business feature components are adapted to a fixed ledger context.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Vue Test Utils, existing `lucide-vue-next` UI system, Spring Boot HTTP APIs, cookie sessions for Web auth.

**Spec:** `docs/superpowers/specs/2026-09-29-multi-tenant-ledger-and-mini-program-design.md`

## Global Constraints

- Ordinary users do not get Web login.
- `/platform` is for `PlatformAdmin` and is read-only for ledger business data.
- `/ledger` is for the two pre-provisioned users of the fixed special ledger.
- The special ledger Web client never shows a ledger switcher.
- Platform and ledger Web sessions use different cookie names and cannot satisfy each other's endpoints.
- Web forms never send a member attribution selector.
- A ledger member can edit/delete only their own transactions and repayments; owner can edit/delete all.
- Shared accounts, assets, liabilities, snapshots, and categories are editable by members; archive/restore controls are owner-only.
- The old shared family access-code unlock page is no longer the application authentication boundary.

---

### Task 1: Split Web Entry Points and Replace the Shared Access Gate

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/src/App.vue`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/api.test.ts`
- Modify: `web/src/components/AppShell.vue`
- Modify: `web/src/components/DesktopNav.vue`
- Modify: `web/src/components/MobileNav.vue`
- Create: `web/src/auth/types.ts`
- Create: `web/src/auth/useWebAuth.ts`
- Create: `web/src/auth/LedgerLogin.vue`
- Create: `web/src/auth/PlatformLogin.vue`
- Create: `web/src/auth/auth.test.ts`
- Modify or retire: `web/public/unlock.html`
- Modify: `web/vite.config.ts`

**Interfaces:**
- `api.loginLedger(username: string, password: string): Promise<LedgerSession>`.
- `api.loginPlatform(username: string, password: string): Promise<PlatformSession>`.
- `api.getSession(kind: 'ledger' | 'platform'): Promise<SessionInfo>`.
- `api.logout(kind: 'ledger' | 'platform'): Promise<void>`.
- `api.createMiniBindingCode(): Promise<{ code: string; expiresAt: string }>` for special-ledger users.
- `useWebAuth(kind): { session, login, logout, refresh }`.

- [ ] **Step 1: Write failing routing/auth tests**

Test that `/platform` mounts the platform login/app, `/ledger` mounts the
ledger login/app, a ledger session cannot render the platform surface, and a
platform session cannot render mutation-capable ledger controls. Test that a
401 clears only the current session and redirects to its own login page.

- [ ] **Step 2: Implement pathname-based app mounting**

Make `main.ts` select a platform root or ledger root from `window.location
.pathname`. Keep the existing development root redirect explicit instead of
silently choosing a user surface.

- [ ] **Step 3: Implement two login views and session helpers**

Use cookie-backed API calls with `credentials: 'include'`. Keep platform and
ledger session state separate in memory. Remove the old shared access-code
unlock flow from normal app startup and update error handling for the new auth
codes.

- [ ] **Step 4: Add special Web binding-code action**

Expose `Bind Mini Program` only in the ledger account/settings surface. Show
the short-lived code and expiry, with explicit copy and refresh actions. Do
not render this action in the platform console or as a general login step.

- [ ] **Step 5: Run focused Web tests**

Run: `npm test -- web/src/auth/auth.test.ts web/src/lib/api.test.ts`

- [ ] **Step 6: Commit**

```bash
git add web/src/main.ts web/src/App.vue web/src/lib/api.ts web/src/lib/api.test.ts web/src/components web/src/auth web/public/unlock.html web/vite.config.ts
git commit -m "feat(web): split platform and ledger authentication"
```

### Task 2: Adapt the Existing Web Ledger Client to Multi-Tenant Data

**Files:**
- Modify: `web/src/features/accounting/AccountingPage.vue`
- Modify: `web/src/features/accounting/TransactionForm.vue`
- Modify: `web/src/features/accounting/TransactionList.vue`
- Modify: `web/src/features/accounting/TransactionTable.vue`
- Modify: `web/src/features/accounting/useTransactions.ts`
- Modify: `web/src/features/accounting/types.ts`
- Modify: `web/src/features/assets/AssetsPage.vue`
- Modify: `web/src/features/assets/AccountForm.vue`
- Modify: `web/src/features/assets/AccountList.vue`
- Modify: `web/src/features/assets/AssetForm.vue`
- Modify: `web/src/features/assets/AssetList.vue`
- Modify: `web/src/features/assets/AssetSnapshotForm.vue`
- Modify: `web/src/features/assets/useAssets.ts`
- Modify: `web/src/features/assets/types.ts`
- Modify: `web/src/features/liabilities/LiabilitiesPage.vue`
- Modify: `web/src/features/liabilities/LiabilityForm.vue`
- Modify: `web/src/features/liabilities/LiabilityList.vue`
- Modify: `web/src/features/liabilities/RepaymentForm.vue`
- Modify: `web/src/features/liabilities/RepaymentList.vue`
- Modify: `web/src/features/liabilities/useLiabilities.ts`
- Modify: `web/src/features/liabilities/types.ts`
- Modify: `web/src/features/analysis/AnalysisPage.vue`
- Modify: `web/src/features/settings/SettingsPage.vue`
- Modify: `web/src/features/settings/SettingsPage.test.ts`
- Modify: all related feature tests under `web/src/features/`

**Interfaces:**
- Every ledger API request uses the authenticated special-ledger session and the backend-selected fixed ledger; no component sends a member ID as record ownership.
- Shared resource types expose `archived` and `createdBy` only where the API contract requires them.
- Page shells receive `LedgerSession` and `LedgerPermissions` rather than the old global family/member assumptions.

- [ ] **Step 1: Write failing component tests for the new permissions**

Update accounting and liability tests to assert member selectors are absent,
the current user can edit/delete only own records, owner sees all edit/delete
actions, and archived shared resources are absent from new-entry controls.

- [ ] **Step 2: Remove member attribution UI and payloads**

Delete member filters/selects from transaction, account, asset, liability, and
repayment forms. Replace record creator display with the API's immutable
creator fields where the product shows attribution. Keep notes as the only
place for non-login people.

- [ ] **Step 3: Add ledger session and owner capability handling**

Load the fixed special ledger context after login. Show member management,
ledger rename, invitation, and archive/restore controls only for owner. Keep
all business pages available to both owner and member.

- [ ] **Step 4: Adapt accounting mutations**

Update transaction create/update/delete calls to omit `memberId`. Disable edit
and delete actions for another member's transactions, keep repayment-generated
transactions read-only, and preserve confirmation dialogs and balance-refresh
invalidation.

- [ ] **Step 5: Adapt assets, liabilities, repayments, and analysis**

Remove member grouping and member ownership fields. Use shared-resource
archive/restore actions for owner only. Keep repayment mutations under the
liability flow, including creator/owner-gated repayment edit/delete, and update
cache invalidation for the new ledger-scoped API.

- [ ] **Step 6: Adapt settings and category management**

Replace family/member settings with fixed-ledger settings. Keep owner-only
member invitation/removal and ledger rename. Make category archive/restore
owner-only, while allowing members to create/edit active categories.

- [ ] **Step 7: Run the existing Web suite**

Run: `npm test -- web/src/features`

Expected: all existing feature tests are updated to the new role and
ledger-context contract; no test should rely on manually created member names.

- [ ] **Step 8: Commit**

```bash
git add web/src/features web/src/components web/src/lib/api.ts
git commit -m "feat(web): adapt special ledger client to shared users"
```

### Task 3: Build the Platform Read-Only Console

**Files:**
- Create: `web/src/platform/PlatformApp.vue`
- Create: `web/src/platform/platformApi.ts`
- Create: `web/src/platform/types.ts`
- Create: `web/src/platform/pages/PlatformLedgerList.vue`
- Create: `web/src/platform/pages/PlatformLedgerDetail.vue`
- Create: `web/src/platform/components/PlatformLedgerTable.vue`
- Create: `web/src/platform/components/PlatformReadOnlySection.vue`
- Create: `web/src/platform/platform.test.ts`
- Modify: `web/src/main.ts`
- Modify: `web/src/styles/base.css`

**Interfaces:**
- `platformApi.listLedgers(query?: string): Promise<PlatformLedgerSummary[]>`.
- `platformApi.getLedger(ledgerId: number): Promise<PlatformLedgerView>`.
- `PlatformLedgerView` contains members, transactions, accounts, assets, liabilities, repayments, and analysis read models.
- No platform module exports POST, PATCH, or DELETE mutation helpers.

- [ ] **Step 1: Write failing platform console tests**

Test platform login -> ledger list -> ledger detail navigation, search by name
or ID, read-only rendering of all approved sections, and absence of mutation
buttons or forms. Test a server `403` leaves the platform session intact and
shows a permission error.

- [ ] **Step 2: Implement platform API and list page**

Create the read-only API wrapper and a dense ledger list with name, ID,
creation time, owner, and member count. Keep the screen operational rather
than marketing-oriented.

- [ ] **Step 3: Implement ledger detail read models**

Render members, transactions, accounts, assets/snapshots, liabilities/
repayments, and analysis summaries with clear ledger identity. Do not reuse
mutation forms from the special-ledger client.

- [ ] **Step 4: Run platform tests and typecheck**

Run: `npm test -- web/src/platform/platform.test.ts`

Then run: `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add web/src/platform web/src/main.ts web/src/styles/base.css
git commit -m "feat(web): add read-only platform console"
```

### Task 4: Complete Web Manual Verification and Deployment Documentation

**Files:**
- Modify: `web/index.html`
- Modify: `deploy/nginx.conf`
- Modify: `deploy/Dockerfile.web`
- Modify: `deploy/README.md`
- Modify: `README.md`
- Create: `web/docs/manual-test-checklist.md`

- [ ] **Step 1: Configure Web entry URLs**

Document `/platform` and `/ledger` routes, HTTPS requirements, cookie behavior,
and the backend auth configuration. Ensure the deployment does not route a
platform session into the ledger app or expose the old unlock page as a
business login.

- [ ] **Step 2: Add the Web manual checklist**

Cover platform read-only access, special ledger Web login before Mini Program
binding, owner/member mutation permissions, binding-code generation, logout,
expired sessions, archived resources, and cross-ledger rejection.

- [ ] **Step 3: Run all Web checks**

Run: `npm test && npm run typecheck && npm run build`.

Then run the local server and verify `/platform` and `/ledger` at desktop and
mobile viewport sizes using the manual checklist.

- [ ] **Step 4: Commit**

```bash
git add web deploy README.md
git commit -m "docs(web): document platform and special ledger clients"
```

## Web Completion Check

Run:

```bash
npm test
npm run typecheck
npm run build
```

The Web work is ready for review only when ordinary users have no Web login,
the platform console is strictly read-only, and the special ledger Web client
shares the same data and role behavior as the Mini Program.
