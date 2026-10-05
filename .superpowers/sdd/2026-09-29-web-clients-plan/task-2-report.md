# Task 2 Implementation Report

## Scope

Adapted the web ledger client to the authenticated special-ledger, shared-user contract. The existing partial implementation in the worktree was completed and kept scoped to the web client; backend/platform Task 1 changes were not modified.

## Files changed

- `web/src/App.vue`
- `web/src/App.test.ts`
- `web/src/auth/LedgerLogin.vue`
- `web/src/auth/types.ts`
- `web/src/lib/api.ts`
- `web/src/lib/resourceInvalidation.ts`
- `web/src/lib/resourceInvalidation.test.ts`
- Accounting: `AccountingPage.vue`, `AccountingPage.test.ts`, `TransactionForm.vue`, `TransactionForm.test.ts`, `TransactionList.vue`, `TransactionTable.vue`, `types.ts`, `useTransactions.ts`, `useTransactions.test.ts`
- Assets: `AssetsPage.vue`, `AssetsPage.test.ts`, `AccountForm.vue`, `AccountList.vue`, `AssetForm.vue`, `AssetList.vue`, `AssetSnapshotForm.vue`, `types.ts`, `useAssets.ts`, `useAssets.test.ts`, `util.ts`
- Liabilities: `LiabilitiesPage.vue`, `LiabilitiesPage.test.ts`, `LiabilityForm.vue`, `LiabilityList.vue`, `RepaymentForm.vue`, `RepaymentList.vue`, `types.ts`, `useLiabilities.ts`, `useLiabilities.test.ts`, `util.ts`
- `web/src/features/settings/SettingsPage.vue`
- `web/src/features/settings/SettingsPage.test.ts`
- This report: `.superpowers/sdd/2026-09-29-web-clients-plan/task-2-report.md`

## Decisions and implementation details

- Ledger login now loads the backend-selected fixed ledger and derives owner/member capabilities from the ledger role. The app shell passes `LedgerSession`, `LedgerSummary`, and `LedgerPermissions` into business pages.
- API requests use the authenticated ledger session and attach the selected ledger context through `X-Ledger-Id`; transaction, account, asset, liability, and repayment payloads no longer send member attribution.
- Transaction edit/delete actions are limited to the transaction creator or ledger owner. Repayment-generated transactions remain read-only and point users to the liability flow.
- Removed member filters, member selectors, member ownership displays, and member-grouped asset views. Creator attribution uses `createdByUserId` where the API supplies it.
- Added ledger-scoped settings for ledger rename, invitations, membership removal, and category archive/restore. Owner-only controls are hidden for members; active category creation remains available.
- Shared resources retain archived rows for owner restore/history views, while archived accounts/categories are filtered out of transaction-entry references. Archived liabilities no longer expose repayment controls, archived assets no longer expose snapshot-update controls, and repayment forms receive active accounts only.
- Removed the stale `members` test prop from `TransactionForm` so the feature suite is warning-free.

## Verification

Commands run from the Task 2 worktree:

```text
$ npm test -- web/src/features
Test Files  9 passed (9)
Tests       131 passed (131)

$ npm run typecheck
> family-ledger@0.1.0 typecheck
> vue-tsc --noEmit
exit 0

$ npm run build
vite v6.4.3 building for production...
✓ 1840 modules transformed.
✓ built in 1.26s
exit 0

$ git diff --check
exit 0
```

The feature test run completed without Vue warning output.

## Concerns

- Feature test fixtures still contain a small amount of legacy `member_id` data to model old backend-shaped fixtures; production request paths and UI no longer use those fields. The compatibility fields can be removed after all fixture/API consumers are fully migrated.
- The backend category contract currently exposes create/archive/restore but no dedicated category rename endpoint, so settings supports active category creation and owner archive/restore while category editing remains represented by transaction category creation.
- The full repository test suite was not run because the requested verification scope was the Web feature suite plus typecheck/build.

## Review fixes

Addressed all five review findings:

- Archived liabilities no longer render row-level or detail-level `还一笔` controls.
- Archived assets no longer render `更新市值`.
- Repayment forms now receive only non-archived accounts; archived accounts remain available for historical repayment display.
- Settings now lets members choose expense or income when creating a category and edit active category names. Owner-only archive/restore controls remain unchanged.
- Removed `member_id`, `updated_by_member_id`, and the legacy `Member` type from asset/liability shared-resource contracts and updated their fixtures.

Focused regression coverage was added to the assets, liabilities, and settings feature tests.

Review-fix verification:

```text
$ npm test -- web/src/features/assets/AssetsPage.test.ts web/src/features/liabilities/LiabilitiesPage.test.ts web/src/features/settings/SettingsPage.test.ts
Test Files  3 passed (3)
Tests       78 passed (78)

$ npm test -- web/src/features
Test Files  9 passed (9)
Tests       134 passed (134)

$ npm run typecheck
> family-ledger@0.1.0 typecheck
> vue-tsc --noEmit
exit 0

$ npm run build
✓ 1840 modules transformed.
✓ built in 2.45s
exit 0
```

Remaining concern: the current backend `CategoryController` exposes category create/upsert and archive/restore, but no `PATCH /api/categories/{id}` rename endpoint. The web edit control targets that ledger-scoped endpoint; implementing the backend route is intentionally outside this Task 2 web-only fix and should be handled with the backend contract work.

## Fix round 2

Completed the two findings left open by review:

- Added ledger-scoped `PATCH /api/categories/{id}` for active-category rename. It uses the existing ledger membership guard, trims and validates the name, rejects duplicate names within the category kind and ledger, and returns the updated category row. Contract tests cover member access, persistence, missing/blank names, duplicates, archived categories, unauthenticated access, Web-session ledger pinning, and cross-ledger lookup.
- The repayment form now receives the account list for history, shows the archived account tied to an existing repayment as a disabled selected option, and rejects saving with it. A user can choose an active account and save. New repayment controls still list only active accounts.
- Pinned the assets and analysis test clocks to their September 2026 fixtures so the full Web feature suite remains deterministic after the calendar moved to October. No production behavior changed for those pages.

Verification from this worktree (backend command run in `backend/`; other commands from the repository root):

```text
$ mvn -q -Dtest=ContractFlowTest#categoryRenameIsLedgerScopedAndRejectsInvalidOrArchivedNames+categoryRenameDoesNotFindCategoryInAnotherLedger test
Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
exit 0

$ npm test -- web/src/features/liabilities/LiabilitiesPage.test.ts web/src/features/settings/SettingsPage.test.ts
Test Files  2 passed (2)
Tests       36 passed (36)
exit 0

$ npm test -- web/src/features
Test Files  9 passed (9)
Tests       135 passed (135)
exit 0

$ npm run typecheck
> vue-tsc --noEmit
exit 0

$ npm run build
vite v6.4.3 building for production...
✓ 1840 modules transformed.
✓ built in 3.66s
exit 0

$ git diff --check
exit 0
```

Concern: this round ran focused backend category contract tests, not the full backend suite; the repayment interaction was verified by Web component tests, not a live browser session.
