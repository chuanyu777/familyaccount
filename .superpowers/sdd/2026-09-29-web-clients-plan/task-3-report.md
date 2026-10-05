# Task 3 Implementation Report

## Status

Implemented the platform-only, read-only ledger console. The pathname split remains `/platform` for platform administrators and `/ledger` for ledger users. Platform business reads use only the two platform GET endpoints; no platform mutation helper or ledger business endpoint is used.

## Files changed

- `web/src/platform/PlatformApp.vue`: platform login/session shell, pathname navigation, browser history, and logout.
- `web/src/platform/platformApi.ts`, `types.ts`: two GET helpers and platform response types.
- `web/src/platform/pages/PlatformLedgerList.vue`, `PlatformLedgerDetail.vue`: searchable list, direct detail navigation, approved read-only sections, loading/empty/error states, and all-time/current analysis labels.
- `web/src/platform/components/PlatformLedgerTable.vue`, `PlatformReadOnlySection.vue`: dense read-only tables.
- `web/src/platform/platform.test.ts`: login, list/search/detail/history, read-only surface, 403 session preservation, and API helper coverage.
- `web/src/main.ts`: mount the platform app at platform paths.
- `web/src/auth/PlatformLogin.vue`: retained as a compatibility wrapper around the platform app for existing imports/tests.
- `web/src/styles/base.css`: platform console and login styles.
- `backend/src/main/java/com/familyledger/platform/PlatformLedgerSummary.java`: platform-only list DTO.
- `backend/src/main/java/com/familyledger/platform/PlatformAdminQueryService.java`, `PlatformAdminController.java`: bounded platform list projection and query support; explicit detail ledger metadata mapping keeps camelCase stable across JDBC drivers.
- `backend/src/test/java/com/familyledger/platform/PlatformAdminControllerTest.java`: list projection, active count, ID search, detail metadata keys, and authorization coverage.

## Endpoint contracts

- `GET /api/platform/ledgers?query=...` remains a platform-admin-only JSON array. Each row now contains `id`, `name`, `createdAt`, `ownerUserId`, `ownerDisplayName`, `memberCount`, and `webEnabled`. Owner is the ledger creator. `memberCount` counts active memberships; ledgers with none return zero. Trimmed queries match a name substring or an exact positive numeric ID. Empty queries return all ledgers ordered by ID.
- `GET /api/platform/ledgers/{id}` remains platform-admin-only. It returns the existing `PlatformLedgerView` with ledger, members, accounts, categories, transactions, assets, liabilities, repayments, snapshots, and analysis. Analysis is the existing all-time transaction totals/counts and current account/asset/liability aggregates, labeled accordingly in the UI.
- Platform pages do not call `/api/stats/*` or ordinary ledger endpoints. A 403 displays a permission error and leaves the valid platform session in place. Existing 401 auth-loss handling remains in the shared API layer.

## Verification

- `npm test -- web/src/platform/platform.test.ts web/src/auth/auth.test.ts`: 2 files, 11 tests passed.
- `mvn -q -Dtest=PlatformAdminControllerTest test` in `backend`: 4 tests passed, 0 failures/errors/skips.
- `npm run typecheck`: passed.
- `npm run build`: passed; 1,848 modules transformed.
- `git diff --check`: passed.
- Local test-profile smoke check through the Web proxy: platform login returned 204; list returned the seeded ledger with creator and active member count; detail returned camelCase ledger metadata and all approved collections. Web runs at `http://127.0.0.1:5173/platform` with the H2 test-profile backend on port 3001.

## Concerns

- The existing platform detail contract returns all business rows without pagination. Very large ledgers may make detail loading and table rendering slow; pagination would require a separate platform read contract.
- A normal backend dev launch requires MySQL. The local smoke check instead used the repository's H2 test configuration on the test classpath; that data is temporary and resets when the process exits.

## Task 3 Review Fix

- Added a read-only `转入账户 ID` column to transaction rows so transfers show both source and destination account IDs.
- Strengthened the platform detail test with a transfer transaction and row-level assertions for its destination account, plus row counts and displayed snapshot and repayment values.
- Red check: `npm test -- web/src/platform/platform.test.ts` failed as expected before the UI change: expected `转入账户 ID`, received only the existing transaction columns (1 failed, 4 passed).
- `npm test -- web/src/platform/platform.test.ts`: passed; 1 file, 5 tests.
- `npm run typecheck`: passed (`vue-tsc --noEmit`, exit 0).
- `npm run build`: passed; 1,848 modules transformed, production bundle built successfully.
