# Final whole-branch review fix report

Date: 2026-10-05 (Asia/Shanghai)

Status: all seven requested findings addressed in one fix wave. No subagents were spawned. Work was performed directly in the existing `multi-tenant-ledger-mvp` worktree, starting from clean commit `ef955397eacea0142bce041a96dc098fff40358f` (`fix(docs): clarify web verification checklist`).

Read the complete Web implementation plan, its referenced multi-tenant design specification, the current progress record, and the affected backend services, authorization/session code, Vue components, API/cache code, and tests. Review-reception guidance informed verification of findings against the implementation; systematic debugging identified the confirmation-state and date-fixture issues; verification-before-completion guidance informed the final checks. The user's explicit single-implementer instruction superseded the plan's subagent workflow.

## 1. Repayment deletion and restrictive foreign key

Root cause: `repayment.transaction_id` references `txn` through the restrictive composite foreign key `fk_repayment_transaction`. `RepaymentService.delete` attempted to delete the generated transaction while the repayment still referenced it, causing a database integrity exception and rollback.

Fix: retain `transaction_id`, reverse account and liability balances, delete the repayment, then delete its generated transaction. Both deletes remain ledger-scoped inside the existing Spring `@Transactional` service method. The generated-transaction source-type restriction is retained. No schema or foreign-key relaxation was made.

Files:

- `backend/src/main/java/com/familyledger/service/RepaymentService.java`
- `backend/src/test/java/com/familyledger/HistoricalCorrectionTest.java`

Regression coverage: `repaymentDeletionRemovesBothRecordsAndRestoresBalances` invokes the real Spring service against the H2 integration schema with foreign keys enabled. It checks that both records disappear, account balance returns to zero, and liability remaining balance returns to its original value. Archived-account tests also exercise deletion by both creator and owner.

## 2. Historical corrections against archived accounts

Root cause: both entry validation and balance-delta application treated historical references as new selections. `applyBalanceDelta` called `getForEntry` and its update required `archived = 0`, so reversing an existing record failed even when editing it onto an active replacement account.

Fix: introduce package-private `applyHistoricalBalanceDelta`, which retains the composite account ID/ledger ID scope and is used only after record-level creator-or-owner authorization. New transactions and repayments continue using the active-account delta path. Corrections may retain an account already referenced in the same position by the existing record; replacement accounts must pass active-entry validation. Both sides of a historical transfer can be reversed. Repayment edits reverse the old account and apply the replacement delta under the same transaction.

Files:

- `backend/src/main/java/com/familyledger/service/AccountService.java`
- `backend/src/main/java/com/familyledger/service/LedgerService.java`
- `backend/src/main/java/com/familyledger/service/RepaymentService.java`
- `backend/src/test/java/com/familyledger/HistoricalCorrectionTest.java`

Regression coverage:

- `archivedRepaymentCanKeepItsAccountThenMoveToAnActiveAccountAndBeDeleted`: changes the amount on the retained archived account, verifies its generated transaction, moves to an active account, archives the replacement, and deletes the repayment.
- `archivedTransferCorrectionsAndDeletionRestoreBothSides`: archives both transfer accounts, edits the amount, moves the source to an active account, and deletes the transfer; verifies balances after each step.
- `newWritesAndReplacementAccountsStillRejectArchivedAccountsWithoutPartialChanges`: rejects archived accounts for new transaction/repayment writes and as unrelated replacement accounts, verifying balances remain unchanged.
- `archivedCorrectionsStillEnforceCreatorAndLedgerScope`: rejects another member's transaction/repayment edit and delete, rejects wrong-ledger IDs, then verifies authorized owner deletion restores balances.
- Existing `RecordPermissionTest` and `LedgerIsolationFlowTest` remain passing.

The existing Web repayment form's requirement to select an active replacement account is preserved. The server now also supports retained historical references for authorized correction callers. Archive rules for categories, liabilities, and assets were not broadened.

## 3. Whitespace-equivalent login throttling

Root cause: controller throttle keys included the raw username, whereas credential queries trimmed it. Different surrounding whitespace therefore reached the same credential with different failure counters.

Fix: centralize the existing trim semantics in `AuthService.canonicalUsername` and use them before building throttle keys and before authenticating on both Web and platform endpoints. Passwords, generic error responses, failure limit, window, and per-surface/per-address separation are preserved.

Files:

- `backend/src/main/java/com/familyledger/auth/AuthController.java`
- `backend/src/main/java/com/familyledger/auth/AuthService.java`
- `backend/src/test/java/com/familyledger/auth/AuthControllerTest.java`

Regression coverage: `whitespaceEquivalentUsernamesShareTheFailureLimitOnBothSurfaces` sends five whitespace variants and verifies the unpadded sixth attempt receives `429 AUTH_RATE_LIMITED` on each surface. `whitespaceEquivalentValidCredentialsAuthenticateOnBothSurfaces` verifies padded valid usernames still authenticate.

## 4. Special Web session discovery boundary

Root cause: the signed session already carried `webSession`, but the session response omitted it. The Web client accepted any `LEDGER_USER`, then picked the first result of ordinary ledger discovery. A valid Mini Program ledger cookie could therefore pass the Web mount checks.

Fix:

- `GET /api/auth/session?kind=ledger` now uses `WebLedgerAuthorization.requireSpecialLedger`, checking both the signed Web-session marker and current active, Web-enabled special-ledger membership.
- The session response exposes `webSession`; `SessionInfo` types it, and both API validation and the Vue auth guard require it to be exactly `true` for ledger Web authentication. Missing and false markers fail closed.
- Web context discovery explicitly requests `GET /api/ledgers?surface=web`. The server applies special-ledger authorization to that discovery even when the incoming cookie is an ordinary Mini Program cookie.
- Ordinary `GET /api/auth/session` and `GET /api/ledgers` remain available to Mini Program principals, as does ordinary ledger creation. Shared ledger business APIs remain available under their existing membership authorization.
- Platform-kind discovery verifies the platform principal. The existing `ledger_session` and `platform_session` names and all cookie flags are unchanged.

Files:

- `backend/src/main/java/com/familyledger/auth/AuthController.java`
- `backend/src/main/java/com/familyledger/ledger/LedgerController.java`
- `backend/src/test/java/com/familyledger/auth/AuthControllerTest.java`
- `web/src/auth/types.ts`
- `web/src/auth/useWebAuth.ts`
- `web/src/auth/auth.test.ts`
- `web/src/lib/api.ts`
- `web/src/lib/api.test.ts`

Regression coverage: real mocked-WeChat login produces an ordinary cookie that is rejected by both Web discovery endpoints while ordinary session/ledger discovery and ledger creation succeed. A Web cookie succeeds and exposes `webSession: true`, then immediately loses discovery permission when membership Web access is revoked. Existing dual-cookie and opposite-surface tests pass.

The previous ledger login test only checked the text `家庭财务`, which also appears on the login page. It now supplies a fixed-ledger response, verifies the authenticated App marker is present, and verifies the login form is absent. Additional tests reject Mini Program, missing-marker, and platform sessions for ledger mounting and require successful fixed-ledger discovery. The 401 test verifies authenticated content exists before dispatching the auth-loss event.

## 5. Authenticated IndexedDB cache isolation

Root cause: cache keys contained only the URL, `setActiveLedgerId` did not invalidate anything, and logout retained cached data. Only background refreshes checked the old global mutation epoch; cache misses and forced reads could write late results after a context change.

Fix:

- Cache keys include a version, authenticated surface, principal ID, active ledger ID, and URL, for example `v2:ledger:7:9:/api/accounts` and `v2:platform:7:none:/api/platform/ledgers`.
- Surface/principal state is established only from an accepted session. Anonymous reads bypass persistent cache. Changing the ledger or identity clears the previous scope, advances its generation, and resets the active ledger on ledger identity changes.
- Logout clears local scope before waiting on the server; this also applies if the logout request fails. The Vue auth state is cleared immediately. A current 401 clears its surface's scope; an old generation's delayed 401 cannot invalidate a newer scope.
- Cache lookups, cache misses, forced reads, and background refreshes capture generation before asynchronous work. Late results cannot be returned across a scope change or repopulate the cache. Delayed session discovery cannot restore a session after logout.
- Disk writes and clears are serialized so a disk write already in progress completes before its logout cleanup, rather than racing the clear.
- Existing mutation epochs still prevent cache writes from pre-mutation network results. Resource invalidation prefixes are scoped. Legacy URL-only entries are cleared and never read. Platform requests no longer send the ledger surface's `X-Ledger-Id` header.

Files:

- `web/src/lib/api.ts`
- `web/src/lib/api.test.ts`
- `web/src/auth/useWebAuth.ts`

Focused API tests cover principal and ledger key separation, platform/ledger separation, previous-scope cleanup, surface-specific logout, fresh-cache lookup races, late foreground/background responses, forced reads completing after mutation, failed logout, late session discovery, current versus stale 401 responses, and pending disk-write ordering. Existing SWR and resource-invalidation tests pass.

## 6. Owner invitation revocation

Root cause: Settings extracted only `token` from the create response, discarding the invitation ID needed by the existing revoke endpoint and its expiry metadata. There was no revoke control.

Fix: retain each invitation's `id`, `ledgerId`, `token`, and `expiresAt` for invitations created during the current Settings mount. Render the token, expiry, and an owner-only `撤销邀请` button. Call `POST /api/invitations/{id}/revoke` and remove only the successfully revoked item. Failed revocations retain the item and show an error for retry. Pending invitation operations disable duplicate submissions. Creating another invitation does not discard earlier invitations' revoke controls.

Files:

- `web/src/features/settings/SettingsPage.vue`
- `web/src/features/settings/SettingsPage.test.ts`
- `backend/src/test/java/com/familyledger/ledger/InvitationControllerTest.java`

Regression coverage: Settings verifies retained token/expiry, exact ID-specific endpoint, removal on success, retryable failure, and hidden controls after owner permission loss. Backend integration coverage verifies the create response metadata, forbids member revocation, permits Web-owner revocation, rejects acceptance of a revoked token, and verifies no membership was created.

No new invitation-list API or token persistence was introduced. Invitations created in earlier Settings mounts are not recovered by this UI; the existing API exposes no listing contract.

## 7. Restore confirmation wording

Root cause: account, asset, and liability confirmations always used archive text even when the selected record was archived and the action would restore it.

Fix: derive restoration state from the confirmation target ID, and use it for the dialog title, explanation, confirm button, and endpoint choice. Restore copy now describes resumed account selection, asset valuation, or liability repayment. Archive copy is preserved for active records.

Files:

- `web/src/features/assets/AssetsPage.vue`
- `web/src/features/assets/AssetsPage.test.ts`
- `web/src/features/liabilities/LiabilitiesPage.vue`
- `web/src/features/liabilities/LiabilitiesPage.test.ts`

Regression coverage exercises account, asset, and liability restore dialogs and verifies their restore endpoints. An intermediate implementation read the detail object, but the dialog transition clears that object. The new tests caught this; the final implementation uses the confirmation target instead. Existing archive confirmation and pending/retry tests pass.

## Full-suite fixture correction

The first full Maven run exposed a pre-existing date dependency in `StatsIsolationTest.everyStatisticsViewUsesOnlyTheRequestedLedger`: transactions and queried snapshots use September 2026, but liability creation used the current October 2026 date. `LiabilityService.liabilitiesAtMonth` correctly excludes liabilities created after the requested month, producing zero instead of the fixture's expected 3000 cents.

Changed only `backend/src/test/java/com/familyledger/StatsIsolationTest.java` to set the created fixture liability's date to `2026-09-01 00:00:00`, scoped by liability ID and ledger ID. Statistics production code and expected accounting values are unchanged. The full suite then passes.

## Verification commands and exact result excerpts

Commands were run from the worktree root, except Maven commands, which were run from its `backend` directory. Runner output was captured in `/tmp/familyaccount-final-*.log`. Excerpts below are verbatim output; temporary logs retain the complete runner output for this session.

### Reproduction before implementation

`mvn -Dtest=HistoricalCorrectionTest,AuthControllerTest test`

```text
[ERROR]   AuthControllerTest.miniProgramSessionCannotDiscoverWebSessionOrContextButKeepsMiniProgramAccess:75 No value at JSON path "$.webSession"
[ERROR]   AuthControllerTest.webDiscoveryRechecksMembershipAndExposesSignedWebMarker:93 No value at JSON path "$.webSession"
[ERROR]   AuthControllerTest.whitespaceEquivalentUsernamesShareTheFailureLimitOnBothSurfaces:55 Status expected:<429> but was:<401>
[ERROR]   HistoricalCorrectionTest.archivedCorrectionsStillEnforceCreatorAndLedgerScope:134 » Api 账户已归档
[ERROR]   HistoricalCorrectionTest.archivedRepaymentCanKeepItsAccountThenMoveToAnActiveAccountAndBeDeleted:67 » Api 账户已归档
[ERROR]   HistoricalCorrectionTest.archivedTransferCorrectionsAndDeletionRestoreBothSides:88 » Api 账户已归档
[ERROR] Tests run: 20, Failures: 3, Errors: 4, Skipped: 0
```

The fourth backend error was the restrictive generated-transaction foreign key. Its database error included:

```text
DELETE FROM txn WHERE id = ? AND ledger_id = ? AND source_type = 'repayment' [23503-224]
```

`npm test -- web/src/auth/auth.test.ts web/src/features/settings/SettingsPage.test.ts web/src/features/assets/AssetsPage.test.ts web/src/features/liabilities/LiabilitiesPage.test.ts`

```text
 Test Files  4 failed (4)
      Tests  7 failed | 87 passed (94)
```

`npm test -- web/src/lib/api.test.ts`

```text
 Test Files  1 failed (1)
      Tests  11 failed | 12 passed (23)
```

These intentional failing runs are in `familyaccount-final-backend-red.log`, `familyaccount-final-web-red.log`, and `familyaccount-final-cache-red.log`. Four additional cache race tests were subsequently added and included in final passing checks.

### Final focused backend suite — exit 0

`mvn -Dtest=HistoricalCorrectionTest,RecordPermissionTest,LedgerIsolationFlowTest,AuthControllerTest,AuthSessionTest,SpecialWebLedgerTest,LedgerAuthorizationTest,InvitationControllerTest test`

```text
[INFO] Tests run: 41, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  24.451 s
[INFO] Finished at: 2026-10-05T12:04:35+08:00
```

Log: `/tmp/familyaccount-final-backend-focused.log`.

### Final focused Web suite — exit 0

`npm test -- web/src/auth/auth.test.ts web/src/lib/api.test.ts web/src/features/settings/SettingsPage.test.ts web/src/features/assets web/src/features/liabilities`

```text
 Test Files  7 passed (7)
      Tests  131 passed (131)
   Start at  12:04:10
   Duration  1.90s (transform 1.38s, setup 127ms, collect 3.20s, tests 1.72s, environment 3.11s, prepare 513ms)
```

Log: `/tmp/familyaccount-final-web-focused.log`.

### Full Web suite — exit 0

`npm test`

```text
 Test Files  22 passed (22)
      Tests  243 passed (243)
   Start at  12:04:43
   Duration  2.88s (transform 1.48s, setup 84ms, collect 4.33s, tests 3.64s, environment 6.48s, prepare 1.08s)
```

Log: `/tmp/familyaccount-final-web-full.log`.

### Typecheck — exit 0

`npm run typecheck`

```text
> family-ledger@0.1.0 typecheck
> vue-tsc --noEmit
```

No diagnostics. Log: `/tmp/familyaccount-final-typecheck.log`.

### Production Web build — exit 0

`npm run build`

```text
> family-ledger@0.1.0 build
> vite build --config web/vite.config.ts

vite v6.4.3 building for production...
transforming...
✓ 1849 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.47 kB │ gzip:  0.34 kB
dist/assets/index-CeKzXWpu.css   45.37 kB │ gzip:  8.12 kB
dist/assets/index-BZSeSpWV.js   195.20 kB │ gzip: 64.10 kB
✓ built in 1.77s
```

Log: `/tmp/familyaccount-final-build.log`.

### Full backend Maven suite

Initial `mvn test` run, before the date-fixture correction, exited 1:

```text
[ERROR] Tests run: 66, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
[INFO] Total time:  30.265 s
[INFO] Finished at: 2026-10-05T12:05:35+08:00
```

Log: `/tmp/familyaccount-final-backend-full.log`. The only failure was the September statistics fixture described above.

Final `mvn test` run, after correction, exited 0:

```text
[INFO] Tests run: 66, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
[INFO] Total time:  30.423 s
[INFO] Finished at: 2026-10-05T12:06:45+08:00
```

Log: `/tmp/familyaccount-final-backend-full-green.log`.

### Diff validation

`git diff --check` exited 0 with no output after all source and test changes. The final diff was also read manually for authorization, ledger scoping, cookie flags, mutation atomicity, cache generation handling, invitation controls, and restore behavior.

## Concerns and validation limits

- No remaining failure in the requested focused checks, full Web suite, full backend suite, typecheck, build, or whitespace validation.
- Backend integration tests use the repository's H2 MySQL-compatibility test profile; this wave did not run a live MySQL/deployed HTTPS/browser acceptance session.
- The full Web suite still emits existing `App.test.ts` Vue warnings for omitted required `session`, `ledger`, and `permissions` props. Its tests pass. The strengthened authentication tests supply explicit sessions and distinguish mounted authenticated content from login screens.
- Invitation revocation controls cover invitations created in the current Settings mount; no existing invitation-list API is available for reloading older invitation metadata.
- No changes to SameSite, Secure, HttpOnly, cookie names, membership/owner/creator authorization, or database constraints. No public ordinary-user Web login was added.
- The report is explicitly included in the fix commit even though `.superpowers` is normally ignored, matching the prior task-report convention.
