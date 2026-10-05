# Task 3 Report

## Status

Implemented ledger list, creation, local switching, invitation creation, invitation acceptance, and member leave flows for the Mini Program.

## Contract decisions

- Invitation acceptance calls `POST /api/invitations/accept`, then fetches `GET /api/ledgers/{membership.ledgerId}` and selects the returned summary.
- No invitation preview or switch endpoint is called because the backend does not expose either endpoint.
- Switching updates `currentLedgerStore`, clears the previous ledger's transactions, accounts, assets, liabilities, repayments, categories, members, and statistics cache keys, then relaunches `/pages/ledger/home`.
- Invitation creation is owner-only in both the service and list UI. Owner leave is rejected before the API call.
- `mini/app.json` was intentionally left unchanged for the main agent to register pages.

## Verification

- `npm test -- mini/services/ledgers.test.ts mini/lib/ledgerCache.test.ts`: 8 passed.
- `npm test`: 27 files, 275 tests passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

## Concerns

- Page registration and the ledger shell route remain the main agent's responsibility, as requested.
- Existing full-suite Vue tests emit pre-existing missing-prop warnings; they do not fail.
- `prototype/` was pre-existing untracked work and was not modified or staged.

## Fix round 1

- `leaveLedger` now trusts only `currentLedgerStore` for the current ledger owner pre-check; the optional caller-supplied ledger role was removed. Non-current ledgers are authorized by the backend.
- Invitation handling now recognizes only the backend-provided `INVITATION_INVALID` code and separately handles missing tokens, network failures, and server errors.
- Backend limitation: `INVITATION_INVALID` intentionally does not distinguish expired, revoked, already-used, already-accepted, or otherwise invalid invitations, because the current backend contract does not provide separate error codes for those causes.
