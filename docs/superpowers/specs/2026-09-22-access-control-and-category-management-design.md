# Access Control and Category Management Design

## Goal

Protect a deployed household ledger without household accounts or a conventional
username/password login. Add safe category management and an efficient picker
when either expense or income categories exceed seven.

This design covers the existing Express server, SQLite store, Vue web app, and
Docker/Nginx deployment. Transaction, asset, liability, and reporting behavior
remain unchanged except for the category rules below.

## Confirmed Decisions

- One shared household access code; no individual accounts.
- Trusted devices remain unlocked for 30 days and can be locked manually.
- The server protects pages and APIs; Vue routing is not the security boundary.
- The access code and session signing secret are deployment environment
  variables, never database records or browser storage.
- Used categories are archived; unused custom categories can be deleted.
- Default categories cannot be archived or deleted.
- The transaction form shows six common categories, `All`, and `New category`.
- Common categories prioritize user-pinned entries, then recent usage.

## Access Control

### Configuration

Production requires non-empty `FAMILY_ACCESS_CODE` and `SESSION_SECRET`
environment variables. The server fails fast if either is missing. Development
does not require a code by default, while an explicit development configuration
can enable the gate for local testing.

Deployment instructions cover HTTPS, these variables, and rotation. Changing
the access code prevents future unlocks with the old code. Changing
`SESSION_SECRET` invalidates every existing trusted-device session.

### Server Flow

1. Unauthenticated app-page requests go to the unlock screen; protected APIs
   return JSON `401 Unauthorized`.
2. The unlock screen sends the shared code through HTTPS to a small public
   unlock endpoint.
3. The server validates it with a timing-safe comparison and creates a signed,
   expiring trusted-device session.
4. That session is returned only through a `HttpOnly`, `SameSite=Strict`,
   `Path=/` cookie with a 30-day lifetime. Production also sets `Secure`.
5. Middleware verifies signature and expiry on every protected request.
6. The explicit lock endpoint clears the cookie.

Only unlock, lock, health check, and assets needed by the unlock screen are
public. All business APIs and normal app pages use the same server guard.

### Abuse and Frontend Behavior

Five failed unlock attempts per client address in a rolling 15-minute window
block more attempts until expiry. The server honors configured proxy headers for
client-address derivation and never exposes partial-code information.

The Vue API client treats `401` as session loss, returns to the unlock screen,
and retains the intended hash route. On success it returns there. Settings adds
`Lock this device`, which clears the session and returns to unlock. Nginx
terminates HTTPS and redirects HTTP to HTTPS in production.

## Category Data and API

### Data Model

Each category gains `is_archived` and `is_pinned` booleans, both defaulting to
`false`. Migration initializes existing rows without changing identifiers or
transaction references. Existing default category names continue to identify
protected system categories.

### Read Rules

Normal category listing returns active categories only. A management option
includes archived categories. Historical transaction details, lists, and reports
retain category display names after archive or rename.

### Write Rules

The category API supports create, rename, pin/unpin, archive, restore, and
delete. Mutations validate kind, trimmed non-empty name, and unique active names
within a kind.

- Default categories cannot be archived or deleted.
- An unused custom category can be permanently deleted.
- A referenced custom category returns a conflict on delete and must be archived.
- Archive hides a category from new entries while retaining history and analytics.
- Restore returns it to new-entry choices.
- Rename changes the displayed historical and analytical category name without
  changing category identifiers.

## Category Management UX

Settings gains Category Management with separate expense and income sections,
each with active and archived views. A category row shows its name, pinned
state, and action menu. Active entries can be renamed, pinned/unpinned, or
archived/deleted as usage allows. Archived entries can be restored or renamed.
Default categories have no destructive action.

Archive, restore, and delete require confirmation. Permanent deletion copy makes
clear that it applies only to categories without transactions.

## Transaction Category Picker

### Primary Picker

Expense and income maintain separate common sets. The form keeps a fixed
four-column, eight-slot grid: six common active categories, `All`, and `New
category`. This prevents category growth from expanding the form.

Pinned active categories appear first; remaining slots use most recently used
active categories of the same kind. Existing stable category order breaks ties.
Newly created categories are selected immediately and take part in subsequent
ranking.

### All Categories Sheet

`All` opens a mobile bottom sheet with a search field, Common section, and All
Categories section. Search filters active categories for the current kind by
name. Choosing a category updates the form and closes the sheet. The sheet has a
Category Management entry.

Archived categories never appear for a new transaction. When editing an older
transaction whose category is archived, the chosen category stays visible and is
labelled archived until the user intentionally replaces it.

## Error States

- Wrong code or rate limit: generic retry feedback without leaking access data.
- Invalid session: unlock screen with preserved intended route.
- Duplicate name: state that the category exists for this income/expense kind.
- Default category action: state that the system retains default categories.
- Used-category deletion: state that it can be archived, not deleted.
- Failed mutations: retain list state and offer retry; do not remove items before
  server confirmation.

## Verification

Automated tests cover protected app/API access, unlock, lock, expiry, cookie
validation, rate limiting, production configuration, category lifecycle,
duplicate/default/used-category error cases, active versus archived reads,
history/reporting preservation, common-category ranking, and mobile picker
search/creation/edit flows.

Manual production verification configures HTTPS and both secrets, unlocks a new
device, locks it, and confirms unauthenticated requests cannot fetch ledger API
data directly.
