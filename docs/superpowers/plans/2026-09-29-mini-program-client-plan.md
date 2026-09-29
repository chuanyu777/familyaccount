# WeChat Mini Program Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the normal-user WeChat Mini Program client for ledger creation, invitations, switching, shared bookkeeping, assets, liabilities, analysis, and owner management.

**Architecture:** Use a native WeChat Mini Program under `mini/` with TypeScript page logic, WXML templates, and WXSS styles. Keep domain rules and authorization in the Spring Boot API; the Mini Program owns navigation, local session presentation, current-ledger state, and client-side form validation only.

**Tech Stack:** WeChat Mini Program runtime, TypeScript, WXML, WXSS, `wx.request`, `wx.login`, and the existing backend HTTP contract. Use the repository's existing Vitest setup for pure client services where practical and WeChat DevTools for page-level verification.

**Spec:** `docs/superpowers/specs/2026-09-29-multi-tenant-ledger-and-mini-program-design.md`

## Global Constraints

- The Mini Program is the primary client for ordinary users.
- The default login path is WeChat login and must not show a Web-account choice.
- The Web binding entry is optional and only used by pre-provisioned special-ledger users.
- A user can create or join multiple ledgers and switch the current ledger.
- Every API request carries or derives the current ledger, but the server remains the authorization boundary.
- The Mini Program exposes all current business functions: accounting, accounts, assets, liabilities, repayments, analysis, categories, ledger settings, invitations, and switching.
- Transactions and repayments never expose a selectable member-attribution field.
- Ordinary members can edit/delete only their own transactions and repayments; owner can edit/delete all.
- Shared resources are editable by members but archive/restore is owner-only.

---

### Task 1: Scaffold the Native Mini Program and Shared Client Contracts

**Files:**
- Create: `mini/project.config.json`
- Create: `mini/app.json`
- Create: `mini/app.ts`
- Create: `mini/app.wxss`
- Create: `mini/types/api.ts`
- Create: `mini/types/domain.ts`
- Create: `mini/lib/http.ts`
- Create: `mini/lib/session.ts`
- Create: `mini/lib/currentLedger.ts`
- Create: `mini/lib/errors.ts`
- Create: `mini/lib/http.test.ts`
- Create: `mini/lib/currentLedger.test.ts`
- Modify: `package.json`
- Modify: `vitest.workspace.ts`

**Interfaces:**
- `request<T>(path: string, options?: RequestOptions): Promise<T>` adds the API base URL, session token, JSON headers, and current ledger context.
- `sessionStore.get(): MiniSession | null`, `sessionStore.set(session: MiniSession): void`, `sessionStore.clear(): void`.
- `currentLedgerStore.get(): LedgerSummary | null`, `set(ledger: LedgerSummary): void`, `clear(): void`.
- `ApiError` preserves server error code and HTTP status for page-level handling.

- [ ] **Step 1: Write failing pure-service tests**

Test that `request` serializes JSON, attaches the Mini Program session token,
normalizes non-2xx responses into `ApiError`, and does not attach a stale
ledger ID after `currentLedgerStore.clear()`. Test that ledger state survives
normal app reload but can be cleared after a membership-denied response.

- [ ] **Step 2: Add the native project scaffold**

Configure the Mini Program app ID and API base URL through the project config
and a small environment module. Register pages only after each page exists;
start with `pages/auth/index` and `pages/ledger/list`.

- [ ] **Step 3: Implement the HTTP/session/current-ledger helpers**

Use `wx.request` and `wx.login` integration points. Keep token storage in the
Mini Program storage API, never in page-local state. On a `401` clear the
session and navigate to authentication; on a ledger membership `403`, clear
the current ledger and navigate to the ledger list.

- [ ] **Step 4: Run client unit tests**

Run: `npm test -- mini/lib/http.test.ts mini/lib/currentLedger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mini package.json vitest.workspace.ts
git commit -m "feat(mini): scaffold native client contracts"
```

### Task 2: Implement WeChat Login, Empty State, and Web Binding Entry

**Files:**
- Create: `mini/services/auth.ts`
- Create: `mini/pages/auth/index.ts`
- Create: `mini/pages/auth/index.wxml`
- Create: `mini/pages/auth/index.wxss`
- Create: `mini/pages/bind-web/index.ts`
- Create: `mini/pages/bind-web/index.wxml`
- Create: `mini/pages/bind-web/index.wxss`
- Create: `mini/pages/ledger/empty.ts`
- Create: `mini/pages/ledger/empty.wxml`
- Create: `mini/pages/ledger/empty.wxss`
- Modify: `mini/app.json`
- Test: `mini/services/auth.test.ts`

**Interfaces:**
- `auth.loginWithWeChat(): Promise<AuthResult>` calls `wx.login`, then backend `/api/auth/wechat`.
- `auth.bindExistingWebAccount(code: string): Promise<AuthResult>` calls backend binding endpoint after WeChat authorization.
- `auth.logout(): Promise<void>` clears the Mini Program session.
- `AuthResult` contains the user summary and available ledgers, never a raw WeChat secret.

- [ ] **Step 1: Write failing auth-service tests**

Test a first-time WeChat login stores a session and routes to the empty state,
an existing user routes to the last ledger, and a binding code is sent only
when the user explicitly opens the binding page. Test invalid/expired codes
show the server error without clearing a valid existing session.

- [ ] **Step 2: Implement direct WeChat onboarding**

The primary auth page has one login action. After success, fetch the user's
ledger list and route to the current ledger or empty state. Do not render a
Web-account selection prompt in this path.

- [ ] **Step 3: Implement the optional binding page**

Expose `Bind existing Web account` only as a secondary action from account
settings/auth support. Ask for the one-time binding code, call the backend,
refresh the user/ledger list, and route to the special ledger on success.

- [ ] **Step 4: Implement the no-ledger empty state**

Provide `Create ledger` and `Accept invitation` actions. Preserve an invitation
token from the app launch query/share path through login, then open invitation
details after authentication.

- [ ] **Step 5: Run tests and manually verify in DevTools**

Run: `npm test -- mini/services/auth.test.ts`

Manual: unauthenticated launch -> WeChat login -> empty state; normal user
never sees binding; a pre-provisioned user can enter a binding code and reach
the special ledger.

- [ ] **Step 6: Commit**

```bash
git add mini/app.json mini/services mini/pages/auth mini/pages/bind-web mini/pages/ledger/empty
git commit -m "feat(mini): add wechat onboarding and web binding"
```

### Task 3: Implement Ledger List, Creation, Switching, and Invitations

**Files:**
- Create: `mini/services/ledgers.ts`
- Create: `mini/pages/ledger/list.ts`
- Create: `mini/pages/ledger/list.wxml`
- Create: `mini/pages/ledger/list.wxss`
- Create: `mini/pages/ledger/create.ts`
- Create: `mini/pages/ledger/create.wxml`
- Create: `mini/pages/ledger/create.wxss`
- Create: `mini/pages/invitation/detail.ts`
- Create: `mini/pages/invitation/detail.wxml`
- Create: `mini/pages/invitation/detail.wxss`
- Create: `mini/components/ledger-switcher/*`
- Create: `mini/services/ledgers.test.ts`

**Interfaces:**
- `listLedgers(): Promise<LedgerSummary[]>`
- `createLedger(name: string): Promise<LedgerSummary>`
- `acceptInvitation(token: string): Promise<LedgerMembership>`
- `switchLedger(ledger: LedgerSummary): void` reloads the ledger shell.
- `createInvitation(): Promise<InvitationView>` is available only when the current user is owner.
- `leaveLedger(ledgerId: number): Promise<void>` rejects owner leave in the UI and API.

- [ ] **Step 1: Write failing service and state tests**

Test creation selects the new ledger, invitation acceptance selects the target
ledger, switching clears all ledger-scoped caches, and a membership-denied
response returns to the ledger list. Test that owner-only controls are hidden
for members.

- [ ] **Step 2: Implement ledger list and create flow**

Render the user's ledgers with owner/member labels and the last active ledger.
Create the ledger through the API and route directly to its shell. Do not
create a ledger automatically on first login.

- [ ] **Step 3: Implement invitation detail and acceptance**

Read the token from the launch query or copied invitation code, fetch the
invitation preview, require explicit confirmation, and call acceptance. Handle
expired, revoked, already-used, and already-member states distinctly.

- [ ] **Step 4: Implement owner invitation creation and sharing**

Add an owner-only action that requests a seven-day invitation token and exposes
the Mini Program share path. Do not add an invitation-management surface for
members.

- [ ] **Step 5: Implement switching and cache invalidation**

Make the selected ledger part of the shell state. On switch, invalidate
transactions, accounts, assets, liabilities, repayments, categories, members,
and statistics before loading the new ledger.

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- mini/services/ledgers.test.ts`

```bash
git add mini/services/ledgers* mini/pages/ledger mini/pages/invitation mini/components/ledger-switcher
git commit -m "feat(mini): add ledger switching and invitations"
```

### Task 4: Build the Shared Ledger Shell and Member Settings

**Files:**
- Create: `mini/pages/ledger/home.ts`
- Create: `mini/pages/ledger/home.wxml`
- Create: `mini/pages/ledger/home.wxss`
- Create: `mini/pages/settings/index.ts`
- Create: `mini/pages/settings/index.wxml`
- Create: `mini/pages/settings/index.wxss`
- Create: `mini/services/members.ts`
- Create: `mini/services/members.test.ts`
- Modify: `mini/app.json`

**Interfaces:**
- `loadLedgerContext(ledgerId: number): Promise<LedgerContext>`
- `listMembers(ledgerId: number): Promise<LedgerMember[]>`
- `removeMember(ledgerId: number, membershipId: number): Promise<void>` owner-only.
- `leaveLedger(ledgerId: number): Promise<void>` member-only.
- `updateLedgerName(ledgerId: number, name: string): Promise<LedgerSummary>` owner-only.

- [ ] **Step 1: Write failing member permission tests**

Test that owner sees invite/remove/configuration controls, member does not,
owner cannot remove itself, and member leave succeeds without deleting any
business data.

- [ ] **Step 2: Implement the ledger shell**

Build the current-ledger header, switcher entry, loading/error/empty states,
and tab navigation for accounting, assets, liabilities, analysis, and settings.
Every page receives the same immutable current ledger context.

- [ ] **Step 3: Implement owner/member settings**

Show member list for all active users. Add owner-only invite generation,
member removal, ledger rename, and archive/restore entry points. Add member
leave for non-owner users. Keep platform administration out of this client.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- mini/services/members.test.ts`

```bash
git add mini/app.json mini/pages/ledger/home mini/pages/settings mini/services/members*
git commit -m "feat(mini): add ledger shell and member settings"
```

### Task 5: Port Accounting, Assets, Liabilities, and Analysis

**Files:**
- Create: `mini/services/transactions.ts`
- Create: `mini/services/accounts.ts`
- Create: `mini/services/assets.ts`
- Create: `mini/services/liabilities.ts`
- Create: `mini/services/statistics.ts`
- Create: `mini/pages/accounting/*`
- Create: `mini/pages/assets/*`
- Create: `mini/pages/liabilities/*`
- Create: `mini/pages/analysis/*`
- Create: `mini/components/category-picker/*`
- Create: `mini/components/money-input/*`
- Create: `mini/components/confirm-dialog/*`
- Create: `mini/services/business-state.test.ts`

**Interfaces:**
- All service methods accept the current `ledgerId` from the shell and use the shared `request` helper.
- `createTransaction(input)` never accepts `memberId`; the backend assigns `createdBy`.
- `createRepayment(input)` never accepts `memberId`; the backend assigns `createdBy`.
- `updateRepayment(id, patch)` never accepts `memberId`; the backend enforces creator-or-owner authorization.
- `archiveSharedResource(kind, id)` is rendered only for owner and handles archived-state errors.

- [ ] **Step 1: Write failing state/service tests**

Test transaction form payloads omit member attribution, repayment payloads use
liability/account IDs, archive errors disable new-entry choices, and deleting
own records refreshes balances/statistics. Test that the client does not show
member selectors anywhere in accounting, assets, or liabilities forms.

- [ ] **Step 2: Implement accounting**

Port expense, income, transfer, category selection, monthly filters, lists,
detail/edit/delete flows, and owner/member delete visibility. Keep repayment-
generated transactions read-only and route repayment changes through the
liability page.

- [ ] **Step 3: Implement assets and accounts**

Port shared account CRUD, default account selection, calibration, asset CRUD,
monthly snapshots, archive/restore, and related statistics. Remove all member
ownership fields and member grouping views.

- [ ] **Step 4: Implement liabilities and repayments**

Port liability CRUD, repayment create/update/delete, remaining-balance
validation, archive/restore, and generated repayment transaction display. Only
the creator or owner may edit/delete a repayment. Updating a repayment must
refresh its generated transaction and the affected account/liability balances.

- [ ] **Step 5: Implement analysis and shared category behavior**

Port summary, trend, and category breakdown views. Add active/archived
category handling and owner-only archive/restore. Archived categories remain
visible on historical records but not in new-entry pickers.

- [ ] **Step 6: Run client tests and manual Mini Program flow**

Run: `npm test -- mini/services/business-state.test.ts`

Manual: create a transaction as user A, confirm user B can view but not edit
or delete it, confirm owner can edit/delete it, then verify account and
liability balances after repayment create/delete.

- [ ] **Step 7: Commit**

```bash
git add mini/pages/accounting mini/pages/assets mini/pages/liabilities mini/pages/analysis mini/components mini/services
git commit -m "feat(mini): add complete ledger workflows"
```

### Task 6: Mini Program Verification and Release Configuration

**Files:**
- Modify: `mini/project.config.json`
- Modify: `mini/app.json`
- Create: `mini/README.md`
- Create: `mini/docs/manual-test-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Add local and production API configuration**

Document the development backend URL, production HTTPS URL, WeChat app ID,
and required backend environment values without committing secrets.

- [ ] **Step 2: Add the manual acceptance checklist**

Cover ordinary login, no-ledger onboarding, ledger creation, invitation share
and acceptance, multiple-ledger switching, owner/member permissions, archive
behavior, special Web binding, and forced logout after removal.

- [ ] **Step 3: Run all repository checks**

Run: `npm test`, `npm run typecheck`, and the Mini Program DevTools build.

- [ ] **Step 4: Commit**

```bash
git add mini README.md
git commit -m "docs(mini): document client setup and acceptance flows"
```

## Mini Program Completion Check

The Mini Program is ready for release review only when ordinary users never
need the Web-binding screen, all five existing feature areas operate against a
selected ledger, and the manual checklist passes against the new backend.
