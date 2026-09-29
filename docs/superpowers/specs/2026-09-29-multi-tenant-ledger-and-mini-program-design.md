# Multi-Tenant Ledger and Mini Program Design

## Status

This is the approved design direction from the requirements discussion. It is a
design specification only; implementation has not started.

## Goal

Turn the existing single-household ledger into a multi-tenant ledger system and
make the core product available in a WeChat Mini Program. A user can create or
join multiple household ledgers, switch the current ledger, and collaborate
with other real users. One fixed special ledger also supports Web-based
bookkeeping for two pre-provisioned users. A separate Web operations console
allows a platform administrator to inspect ledger business data in read-only
mode.

The MVP prioritizes the Mini Program as the normal user client and keeps Web
access deliberately narrow.

## Scope Decisions

- The tenant is a `Ledger`, not a `Family` entity.
- A `User` is global and can participate in multiple ledgers.
- Ledger roles are only `OWNER` and `MEMBER`.
- `OWNER` is fixed to the user who creates the ledger. MVP does not support
  ownership transfer or ledger deletion.
- `PlatformAdmin` is a separate operations identity, not a ledger role.
- Ordinary users use the Mini Program. Ordinary users do not get Web login.
- The MVP has one fixed Web-enabled special ledger.
- Two pre-provisioned Web users can use that ledger from Web before their WeChat
  identities are registered.
- There is no SMS, email, or QR-code login in the MVP.
- Existing single-ledger data is not migrated.
- No legacy member records are retained. A ledger member must be a real user.

## Domain Model

### User

`User` is the global identity used by business records. A user may have a
WeChat identity, an optional Web credential, or both.

Normal Mini Program registration creates a user when a previously unknown
WeChat identity logs in. A pre-provisioned Web user exists before the WeChat
identity is bound to it.

### Ledger

`Ledger` is the tenant and the isolation boundary for all accounting data.
Transactions, accounts, assets, liabilities, repayments, snapshots, categories,
memberships, and invitations belong to one ledger.

The current ledger is a client navigation choice, not a security grant. Every
business request is authorized on the server against the user's membership in
the requested ledger.

### Ledger Membership

`LedgerMembership` connects a user to a ledger and contains one of two roles:

- `OWNER`: the ledger creator. The owner manages membership and ledger-level
  configuration, and can archive or restore shared resources.
- `MEMBER`: a regular ledger member. Members can use the shared business
  functions and manage their own transactions and repayments.

Membership removal or voluntary exit revokes access but never deletes business
data created by that user. The owner cannot leave or be removed in the MVP.

### Invitation

An `Invitation` is a ledger-scoped, single-use invitation created by the owner.
It is not bound to a phone number or WeChat identity before acceptance. The
invitee becomes a `MEMBER` only after an authenticated user explicitly accepts
it.

Invitations expire after seven days by default and can be revoked by the
owner. An already active member opening the same invitation sees an already
joined state and does not get a duplicate membership.

### Platform Administrator

`PlatformAdmin` is a separate operations principal. It is not a `User`, does
not belong to ledgers, and does not receive ledger-member permissions. It can
read ledger business data through the operations console, but cannot mutate
business data.

### Web Ledger Access

Web ledger access is a capability of selected memberships in the one special
ledger. It is not a role and does not make a user a `PlatformAdmin`.

The special ledger is initialized with two Web users and their memberships:
the product owner is the ledger `OWNER`, and the spouse is a ledger `MEMBER`.
Their Web credentials are created before their Mini Program identities are
bound.

## Architecture

Use one Spring Boot backend, one database, and one business domain model. The
Mini Program, the platform operations Web client, and the special ledger Web
client all use the same ledger business APIs.

The backend has these logical boundaries:

- `Auth`: WeChat login, Web credential login, platform administrator login,
  sessions, and Mini Program binding codes.
- `Ledger`: ledger creation, current-ledger access, membership, ledger
  configuration, and ownership rules.
- `Invitation`: owner-created invitations, acceptance, revocation, expiry, and
  duplicate handling.
- Existing accounting services: transactions, accounts, assets, liabilities,
  repayments, snapshots, categories, and statistics, all ledger-scoped and
  subject to the new creator and role rules.
- `PlatformAdmin`: read-only cross-ledger queries for the operations console.

The existing Web codebase may host two clearly separated Web areas, but the
areas must use separate login routes, sessions, and server-side authorization:

- `/platform`: platform administrator operations console.
- `/ledger`: special-ledger Web bookkeeping client.

The platform administrator session must never be accepted by ledger mutation
endpoints, and a ledger Web session must never be accepted by platform
operations endpoints.

## Authentication Flows

### Normal Mini Program User

1. The user logs in with WeChat.
2. If the WeChat identity is not linked, the backend creates a new `User`.
3. The Mini Program shows the user's ledgers or the no-ledger onboarding state.
4. The user can create a ledger or accept an invitation.

Normal users do not see a mandatory Web-account choice and are not asked for a
phone number.

### Pre-Provisioned Web User

1. The platform administrator creates a Web username and password and assigns
   the user to the special ledger.
2. The user can log in to `/ledger` and record data before using the Mini
   Program.
3. The user logs in to Web and generates a short-lived, single-use Mini
   Program binding code.
4. The user opens the optional binding entry in the Mini Program and completes
   WeChat authorization.
5. The user enters the binding code.
6. The backend binds the current WeChat identity to the existing `User`.
7. Later Mini Program logins use WeChat directly and reach the same user and
   ledger data as Web.

The binding entry is optional and is not part of the normal Mini Program
onboarding path. Binding does not merge two existing users. If the WeChat
identity is already linked to another user, the operation is rejected and the
existing users remain unchanged. Special users are expected to bind before
using the normal new-user path.

### Platform Administrator

The platform administrator signs in to `/platform` with a pre-provisioned
username and password. There is no public registration, SMS recovery, or
email recovery in the MVP. Credential reset is an operator/deployment action.

Platform administrator credentials, Web ledger credentials, and WeChat
identities are separate authentication methods attached to separate principals
or to the intended `User`; they are never implicitly merged by name, nickname,
or other display data.

## Ledger Workflows

### First Mini Program Entry

If the user has no ledgers, the Mini Program shows:

- `Create ledger`
- `Accept invitation`

It does not create an empty default ledger automatically. If the user entered
through an invitation, the invitation details are shown after authentication
and acceptance makes that ledger the current ledger.

### Create Ledger

Creating a ledger makes the creator its fixed `OWNER` and initializes:

- One default account with a zero balance.
- The current base income and expense categories.

The initialized objects belong only to the new ledger. No data or custom
configuration is copied from another ledger.

### Switch Ledger

A user can belong to multiple ledgers. The Mini Program remembers the last
current ledger for navigation convenience. Switching always reloads all
ledger-scoped resources and clears stale page data from the previous ledger.

The special ledger Web client does not show a ledger switcher and is fixed to
the special ledger.

### Member Management

Only the owner can create and revoke invitations, remove members, and edit
ledger-level configuration. An invitee must accept their own invitation. The
owner cannot remove itself.

Members can voluntarily leave a ledger. Leaving or removal only revokes future
access. Existing records remain visible to the remaining members, including
their original `createdBy` value.

MVP does not support ownership transfer or ledger deletion.

## Permission Model

All active ledger members can view all business data in that ledger.

| Capability | Owner | Member | PlatformAdmin |
| --- | --- | --- | --- |
| View ledger data | Yes | Yes | Read-only across ledgers |
| Create transactions | Yes | Yes | No |
| Edit/delete own transactions | Yes | Yes | No |
| Edit/delete another member's transactions | Yes | No | No |
| Create repayments | Yes | Yes | No |
| Edit/delete own repayments | Yes | Yes | No |
| Edit/delete another member's repayments | Yes | No | No |
| Create/edit accounts, assets, liabilities, categories | Yes | Yes | No |
| Create asset snapshots | Yes | Yes | No |
| Archive/restore shared resources | Yes | No | No |
| Invite/remove members | Yes | No | No |
| Modify ledger configuration | Yes | No | No |
| Transfer ownership | No | No | No |
| Delete ledger | No | No | No |

`createdBy` is immutable. It is used for transaction and repayment edit/delete
authorization and for displaying the original creator.

## Business Data Rules

### Transactions and Repayments

Transactions and repayments record the current authenticated user as
`createdBy`. The UI does not offer a member selector. Information about
non-login people such as children or elders is written in the note field.

A repayment belongs to the liability domain. It references a liability and a
payment account, changes the liability's remaining balance, and changes the
payment account balance. It may be displayed in the general ledger flow, but
the liability repayment remains its source of truth.

Transaction creation/deletion and account balance changes are atomic. Repayment
creation/deletion, liability balance changes, and payment account changes are
atomic. A failed mutation leaves both the business records and balances
unchanged.

### Shared Resources

Accounts, assets, liabilities, snapshots, and categories are shared ledger
resources rather than member-owned records. All active members can create and
edit them. Only the owner can archive or restore them.

None of these resources is physically deleted in the MVP. Archive removes an
object from new-entry choices while preserving historical references and
display. An archived account cannot be selected for new transactions; an
archived asset cannot receive new snapshots; an archived liability cannot
receive new repayments; and an archived category cannot be selected for new
transactions or repayments.

An archived resource can be restored by the owner. Historical records remain
valid while the resource is archived.

## Clients and Feature Scope

### Mini Program

The Mini Program is the complete normal user client. It covers:

- Ledger creation, invitation acceptance, switching, and owner membership
  management.
- Income, expense, transfer, and repayment flows.
- Accounts and account balances.
- Assets and asset snapshots.
- Liabilities and repayments.
- Monthly statistics and analysis.
- Categories and ledger settings.

### Platform Operations Web

The platform console can list and locate ledgers, open a ledger, and read its
members, transactions, accounts, assets, liabilities, repayments, and analysis.
It has no business write operations in the MVP. It does not provide general
user management, ledger status controls, invitation management, impersonation,
export, or audit-log features.

### Special Ledger Web

The special ledger Web client provides the same business functionality and
role-based behavior as the Mini Program for the two pre-provisioned users. It
is fixed to the special ledger and is not a general Web client for other users
or ledgers.

## Error and Security Behavior

- Invalid Web credentials return a generic failure and are rate-limited.
- Invalid, expired, revoked, or already-used invitation tokens do not create a
  membership.
- Invalid, expired, or already-used binding codes do not change identities.
- A WeChat identity already linked to another user cannot be rebound.
- A removed member's later requests fail membership authorization immediately.
- A request containing a different ledger ID cannot bypass membership checks.
- Platform administrator write attempts return forbidden and do not mutate data.
- Attempts by a member to edit or delete another member's transaction or
  repayment return forbidden.
- Archived resources are rejected by new-entry APIs with a clear domain error.
- Failed balance-affecting writes do not partially apply their related changes.

## MVP Initialization and Deployment

The deployment starts from the new multi-tenant schema without historical data
migration. Initialization creates:

- One fixed special ledger.
- One platform administrator account.
- Two Web users assigned to the special ledger, with one owner and one member.
- Their pre-provisioned Web credentials.

Secrets and credentials must be supplied through the deployment's secure
configuration path. Public registration and credential recovery are outside
the MVP.

## Explicitly Out of Scope

- SMS, email, and QR-code authentication.
- Phone-number login or mandatory phone binding.
- General Web login for ordinary users.
- A second Web-enabled ledger.
- A general Web account self-registration flow.
- Ledger ownership transfer.
- Ledger deletion.
- Historical single-ledger data migration.
- Manual non-user ledger members.
- Member attribution selectors for transactions or repayments.
- Platform-admin business-data mutation.
- Platform user/ledger lifecycle administration beyond read-only inspection.
- Export, impersonation, audit logs, and automated password recovery.

## Acceptance Criteria

The design is ready for implementation when the system can demonstrate:

1. A new WeChat user can register, create a ledger, and see initialized default
   data.
2. An owner can invite another user; the invite expires after seven days,
   accepts once, and creates a member relationship.
3. A user with multiple ledgers can switch ledgers without data leakage or
   stale data from the previous ledger.
4. A member can create transactions and repayments, edit/delete their own
   records, and cannot edit/delete another member's records.
5. The owner can manage all transactions and repayments and can manage members
   and shared-resource archive state.
6. Account, asset, liability, category, and historical-reference behavior
   matches the archive rules.
7. A pre-provisioned Web user can log in before WeChat registration, bind the
   Mini Program identity with a one-time code, and see the same data from both
   clients.
8. A normal Mini Program user never needs to see the Web binding flow.
9. The platform administrator can inspect any ledger but cannot mutate any
   business data.
10. Transaction and repayment balance changes are atomic and correct after
    create, edit, and delete operations.
