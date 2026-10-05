# Task 4 Report: Web Routes and Deployment

## Implemented

- Production Compose starts `mysql`, `app`, and `web` by default; removed the obsolete `legacy-web` profile. The Web image still builds one Vite SPA and serves its assets through Nginx.
- The SPA document title identifies the platform and special-ledger clients. Existing pathname selection maps `/platform` and `/ledger` (including nested paths) to separate surfaces; the Nginx fallback and `/api/` proxy remain in place. The former `/unlock.html` is explicitly a compatibility redirect to `/ledger`, not a login page.
- Added a concise root README and updated canonical deployment guidance with browser URLs, pre-provisioned roles, same-origin API and `platform_session`/`ledger_session` boundaries, production `SESSION_SECRET` and `SESSION_COOKIE_SECURE=true`, and external TLS termination plus public HTTP redirect responsibility. Nginx still listens only on HTTP; its `X-Forwarded-Proto` reflects that internal hop. No `SameSite` or `Secure` settings were weakened.
- Added `web/docs/manual-test-checklist.md` with direct-load/refresh, platform read-only, Web-before-binding, role and binding-code, cookie isolation/logout, expiry, archive, cross-ledger, and HTTPS checks. Marked dated shared-access-code design and status documents historical while retaining their original content.
- Adjusted one date-dependent MonthPicker test: its “this month” scenario now sets the maximum selectable month to the current month. The old fixed September 2026 cap made that test fail in October 2026.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | Pass: 22 files, 222 tests. Initial run failed only the date-dependent MonthPicker case; rerun after the focused test correction passed. Existing Vue missing-prop warnings remain in `App.test.ts`. |
| `npm run typecheck` | Pass (exit 0). |
| `npm run build` | Pass; `web/dist/index.html`, hashed JS/CSS assets, and compatibility `unlock.html` emitted. |
| `docker compose -f deploy/docker-compose.prod.yml config --no-interpolate --services` | Pass; `mysql`, `app`, `web` are listed. |
| `git diff --check` | Pass. |
| Unauthenticated local route/refresh checks | **Passed.** Vite preview at `http://127.0.0.1:4173/` returned HTTP 200 HTML for `/platform`, `/platform/ledgers`, `/platform/ledgers/42`, `/ledger`, and `/ledger/settings`; hashed JS asset returned HTTP 200. At 1280x800 and 390x844, nested platform paths showed the platform login and ledger paths showed the ledger login. Mobile `/ledger/settings` refresh stayed on the ledger surface. No horizontal document overflow at either tested width. |

### Verification Matrix

| Verification area | Status | Evidence / limitation |
| --- | --- | --- |
| Unauthenticated local routes and refresh | **Passed** | Local built-SPA preview checks described above; this verifies routing/shell loading only. |
| Authenticated role permissions | **Pending** | Requires provisioned platform-admin, owner, and member accounts; not verified in this environment. |
| Platform/ledger principal binding | **Pending** | Authenticated session-to-role and fixed-ledger behavior require provisioned credentials; not verified. |
| Cookie isolation and logout | **Pending** | Requires authenticated browser sessions; production Secure-cookie behavior also needs HTTPS. |
| Archive and restore permissions | **Pending** | Owner/member authenticated actions have not been exercised in a deployed environment. |
| Cross-ledger rejection | **Pending** | Forged ledger/resource ID checks require authenticated ledger-user sessions and a second ledger. |
| Production HTTPS and proxy behavior | **Pending** | Docker daemon is unavailable, and production credentials/environment are unavailable; container Nginx, edge TLS redirect, and real `/api`/`/healthz` proxy were not exercised. |

## Limits and follow-up

- Docker daemon is unavailable on this machine (`docker info` cannot connect), and standalone `nginx` is not installed. Compose service listing was validated, but the actual container Nginx config and edge TLS redirect were not exercised.
- The preview has no running backend or provisioned test users. Authenticated role permissions, binding through the Mini Program, cookie flags and logout in an HTTPS browser, archived resources, cross-ledger rejection, and the real `/api`/`/healthz` proxy still require the manual checklist in a deployed test environment. No production HTTPS success is claimed.
- The backend's logout clear-cookie header omits `Secure` while issued production cookies include it. Cookie removal is keyed by name/path/domain, but HTTPS browser deletion should be confirmed during the logout checklist. This task did not change backend cookie behavior.

## Fix Note

- Clarified that platform administrators may inspect any existing ledger and that a missing ledger ID returns 404; the forged-ID cross-ledger rejection scenario now explicitly applies to a ledger-user session.
- Expanded the shared-resource checklist to cover accounts, assets, liabilities, snapshots, and categories individually, including member create/edit access and owner-only archive/restore for accounts, assets, liabilities, and categories. Snapshots have no independent archive/restore action.
- Added the explicit verification matrix above. Unauthenticated local route/refresh checks are marked passed; authenticated role, binding, cookie isolation, archive, cross-ledger, and production HTTPS/proxy checks remain pending. Docker is unavailable and production credentials/environment are unavailable; no pending check is represented as passed.
