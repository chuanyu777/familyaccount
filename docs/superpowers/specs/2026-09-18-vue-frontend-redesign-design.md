# Vue Frontend Redesign Design

Date: 2026-09-18
Status: Approved in conversation
Scope: `web/` only

## 1. Context

The current Vue frontend implements the core household accounting flows, but its visual system, responsive behavior, component boundaries, and interaction states are inconsistent. The redesign keeps the existing backend API and business rules unchanged while rebuilding the frontend as a responsive, professional financial tool for both desktop and mobile use.

The approved direction is:

- Layout direction B: a unified ledger structure across desktop and mobile.
- Visual palette C3, "Ultramarine Signal": cool white surfaces, dark ink navigation, ultramarine actions, jade income, red expense, and restrained amber chart accents.
- Mobile refinement: compact transaction rows and a larger icon-led bottom navigation.

The built-in Image Gen capability was unavailable in this session. The user explicitly approved code-native, high-fidelity browser prototypes as the design source of truth.

## 2. Goals

- Preserve all existing frontend business capabilities and backend contracts.
- Produce a coherent, professional interface on desktop, tablet, and mobile.
- Make transaction entry fast and reliable on mobile.
- Improve scanability for transactions, assets, liabilities, and analysis data.
- Replace broad global refresh behavior with resource-specific invalidation.
- Provide complete loading, empty, error, success, and destructive-action states.
- Improve keyboard, focus, touch-target, and reduced-motion accessibility.

## 3. Non-Goals

- No backend, database, or API contract changes.
- No new accounting features or business rules.
- No migration to another frontend framework.
- No Pinia or other global state-management dependency.
- No marketing page or onboarding flow.

## 4. Chosen Architecture

Keep Vue 3, TypeScript, and Vite. `App.vue` becomes composition glue for the responsive application shell, navigation, and active page. The selected page is synchronized with fixed hashes (`#accounting`, `#assets`, `#liabilities`, `#analysis`, and `#settings`) so refresh and browser navigation preserve context without adding a routing framework.

Each feature remains under its existing domain folder:

- `features/accounting`
- `features/assets`
- `features/liabilities`
- `features/analysis`
- `features/settings`

Each feature separates:

1. Page containers that own requests and workflow state.
2. Focused display components for rows, summaries, charts, and detail views.
3. Form components for create and edit operations.
4. Composables for feature data, filters, request lifecycle, and mutations.

Shared UI components own repeated behavior and appearance. `App.vue` must not accumulate feature-specific markup.

## 5. Responsive Application Shell

### Desktop

- Dark ink top navigation with product name, five primary sections, and family name.
- Main content constrained to a readable maximum width while using available horizontal space for tables and two-column groups.
- Page title and one primary action at the top of each page.
- Desktop transaction and management views use quiet tables or open grouped layouts, not card grids.

### Mobile

- Compact page header with title and page-specific context or action.
- Five-item fixed bottom navigation with Lucide-style line icons and 11px labels.
- Navigation height is 70px plus the safe-area inset.
- Active navigation uses ultramarine icon/text, heavier icon stroke, and a short top indicator.
- The transaction FAB sits above the navigation and never overlaps content or tap targets.
- Main content includes bottom padding for navigation, FAB, and safe areas.

### Breakpoints

- Mobile baseline: 360-430px.
- Tablet behavior begins around 768px.
- Desktop table and multi-column behavior begins around 1024px.
- Layout must remain functional between breakpoints without fixed viewport assumptions.

## 6. Visual System

### Color Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F4F6F9` | Application background |
| `--surface` | `#FFFFFF` | Primary surfaces and dialogs |
| `--surface-accent` | `#E6EBFB` | Selected and soft action states |
| `--ink` | `#131722` | Primary text |
| `--muted` | `#697080` | Secondary text |
| `--line` | `#DCE1E9` | Dividers and borders |
| `--nav` | `#121A2D` | Desktop navigation |
| `--primary` | `#3159D7` | Primary actions and active state |
| `--primary-strong` | `#294BB5` | Hover and pressed primary state |
| `--income` | `#19765D` | Income and positive money states |
| `--income-soft` | `#E4F1ED` | Soft income surfaces |
| `--expense` | `#B84543` | Expense and destructive money states |
| `--expense-soft` | `#F7E9E8` | Soft expense and destructive surfaces |
| `--chart-accent` | `#D49F2F` | Secondary chart series only |

Income remains green and expense remains red throughout the product. Primary blue is not used as a money semantic.

### Typography

- System sans-serif stack optimized for Chinese UI text.
- Explicit control typography; no browser-default button, input, or select sizing.
- Tabular numerals for all monetary values and aligned data.
- Desktop page title: about 22px, semibold.
- Mobile title: about 16px, semibold.
- Primary mobile row label: 12px; metadata: 9-10px; amount: 12px semibold.
- Letter spacing remains zero except for intentional uppercase micro-labels.

### Geometry and Elevation

- Card and panel radius: 8px maximum.
- Control radius: 5-6px.
- Mobile sheets: 14px top corners.
- Borders and spacing establish hierarchy; shadows are limited to dialogs, the FAB, and subtle raised surfaces.
- No nested cards and no decorative gradients.

### Icons

- Add `lucide-vue-next` and use that one consistent line-icon family.
- Default stroke around 1.8px; active navigation around 2.2px.
- Bottom navigation icons are 20px; common inline icons are 16-18px.
- Icon-only buttons require an accessible label and tooltip when meaning is not obvious.

## 7. Shared Components

- `AppShell`: responsive structure and content boundaries.
- `DesktopNav`: top navigation and family identity.
- `MobileTabBar`: icon-led mobile navigation with safe-area handling.
- `PageHeader`: title, context, and one primary action.
- `SummaryStrip`: primary metric plus secondary metrics; collapses to compact mobile summary.
- `SegmentedFilter`: transaction type and equivalent local filters.
- `DataTable`: desktop tabular layout with responsive ownership delegated to feature row components.
- `MobileList` and feature row variants: compact, 54px minimum transaction rows.
- `AppDialog`: desktop modal behavior.
- `AppSheet`: mobile bottom-sheet behavior.
- `ConfirmDialog`: explicit destructive confirmation.
- `AsyncState`: loading skeleton, empty state, inline error, and retry action.
- `AppToast`: short success feedback; errors stay near the failed interaction.
- Shared form controls with labels, help text, validation, disabled, and busy states.

## 8. Page Designs

### Accounting

- Page title, selected month, and primary "记一笔" action.
- Summary strip for monthly net, income, and expense.
- Type filter plus secondary account/member filters.
- Desktop: table columns for category/note, account, member, and amount.
- Mobile: date groups and compact 54px transaction rows with a 30px category icon, label, one-line metadata, and right-aligned amount.
- Whole rows open details. Edit and delete actions live in the detail view.
- Mobile FAB opens transaction entry.

### Transaction Entry

- Desktop: approximately 520px dialog.
- Mobile: bottom sheet with dynamic-height-safe scrolling.
- Type control for expense, income, and transfer.
- Large amount entry, category selection, account, member, date, and optional note.
- Existing transfer-specific fields appear only for transfers.
- Amount and required business fields are validated before submission.
- Save success closes the surface, refreshes affected resources, shows a toast, and places the new transaction at the top.

### Assets

- Net worth, total assets, and total liabilities summary.
- Desktop uses two open groups for financial accounts and asset items.
- Mobile uses compact grouped rows.
- Whole rows open details; create and update actions use responsive dialog/sheet surfaces.
- Existing calibration, snapshot, default-account, and deletion constraints remain unchanged.

### Liabilities

- Total liabilities and existing repayment metrics.
- Desktop table with remaining principal, progress, and the high-frequency "还一笔" action.
- Mobile rows show name, remaining amount, payment date, and progress.
- Detail view owns edit, repayment history, and delete actions.

### Analysis

- Month selection and existing monthly snapshot metrics.
- Income/expense trend uses paired, restrained bars.
- Category breakdown uses horizontal bars and direct percentages.
- Charts use primary blue, income green, expense red, and limited amber accents.
- Empty datasets display a clear empty state instead of blank chart frames.

### Settings

- Family name and family-member management only, matching existing capabilities.
- Desktop and mobile use quiet list groups rather than nested cards.
- Member deletion explains that linked historical data becomes family-owned.

## 9. Data Flow and Mutation Rules

Feature composables expose consistent state:

```ts
{
  data,
  loading,
  refreshing,
  error,
  reload
}
```

Requests use sequence identifiers or abort signals so stale responses cannot overwrite newer month or filter selections.

Mutations follow this order:

1. Validate locally.
2. Disable the submitting action and expose a busy label.
3. Send the existing API request.
4. On success, invalidate only affected resource keys.
5. Reload visible affected data.
6. Close the surface and show success feedback.
7. On failure, preserve the form and show an actionable inline error.

Financial writes are not optimistically applied.

The current broad `revision` refresh mechanism is replaced with resource-specific invalidation for transactions, accounts, assets, liabilities, members, family, and statistics. A mutation may invalidate multiple related resources when required by existing business behavior, such as repayment affecting liabilities, accounts, transactions, and statistics.

## 10. State and Error Handling

- Initial loading: structure-matched skeletons, not spinners.
- Background refresh: keep visible data and show only a subtle busy state.
- Empty state: concise explanation plus the most relevant creation action.
- Read failure: preserve prior valid data when available and show inline retry.
- Form failure: retain user input and focus the first invalid field or error summary.
- Delete failure: keep the detail surface open and explain why deletion failed.
- Success: short toast, approximately 1.6-2 seconds.
- API error messages continue to come from the existing normalized API client.

## 11. Accessibility and Interaction

- Minimum touch target: 44x44px.
- Dialog and sheet focus is trapped while open and restored to the opener on close.
- Escape closes non-destructive overlays.
- Background scroll is locked under overlays.
- Controls have visible focus states and semantic labels.
- Money semantics are communicated by sign and text, not color alone.
- Motion respects `prefers-reduced-motion`.
- Safe-area insets are applied to mobile navigation, sheets, and FAB positioning.

## 12. Testing Strategy

### Automated

- Preserve and update existing Vitest tests.
- Add component tests for navigation, dialogs/sheets, filters, async states, and destructive confirmations.
- Add feature tests for transaction creation/edit/delete, asset/account workflows, liability repayment, analysis empty states, and family/member management.
- Add tests proving stale requests cannot replace newer filter or month results.
- Run `npm test`, `npm run typecheck`, and `npm run build`.

### Browser QA

- Desktop: 1440x900.
- Tablet: representative width around 768-1024px.
- Mobile: 390x844 and a narrow 360px check.
- Verify page identity, nonblank render, no framework overlay, console health, and core interaction paths.
- Verify overflow, clipping, wrapping, keyboard focus, touch targets, dialog behavior, and reduced motion.
- Compare final screenshots with the approved C3 concept and mobile refinement before completion.

## 13. Design References

The browser companion files are temporary design references and are not production assets:

- Full C3 application concept: `.superpowers/brainstorm/9619-1789723320/content/c3-complete-app.html`
- Approved mobile density/navigation refinement: `.superpowers/brainstorm/9619-1789723320/content/mobile-density-nav-v2.html`
- Palette selection context: `.superpowers/brainstorm/9619-1789723320/content/premium-palettes.html`

The mobile refinement overrides the mobile transaction-list and bottom-navigation treatment shown in the earlier full-app concept.

## 14. Acceptance Criteria

- All existing user-facing workflows remain available against unchanged APIs.
- Desktop and mobile use the approved C3 palette and unified ledger structure.
- Mobile transaction rows use the approved compact density and category icons.
- Mobile bottom navigation matches the approved icon-led refinement.
- No horizontal overflow at supported widths.
- Loading, empty, error, success, and destructive states are implemented consistently.
- Core workflows update real UI state and pass automated and browser verification.
- No material visual mismatch remains against the approved concept at handoff.
