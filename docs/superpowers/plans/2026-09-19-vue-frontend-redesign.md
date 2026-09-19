# Vue Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Vue frontend into the approved C3 responsive financial interface while preserving every backend API and business rule.

**Architecture:** Keep Vue 3, TypeScript, and Vite. Build a responsive app shell and shared UI primitives, replace global revision refreshes with resource-specific invalidation, and split each large feature page into a data composable plus focused desktop/mobile display components and forms. Each task leaves the application runnable and independently testable.

**Tech Stack:** Vue 3.5, TypeScript 5.7, Vite 6, Vitest 2, Vue Test Utils, Testing Library DOM, `lucide-vue-next`

**Spec:** `docs/superpowers/specs/2026-09-18-vue-frontend-redesign-design.md`

## Global Constraints

- Modify `web/` only except for package metadata, tests, and this plan.
- Keep all backend endpoints, request fields, response fields, and accounting rules unchanged.
- Use fixed hashes: `#accounting`, `#assets`, `#liabilities`, `#analysis`, and `#settings`.
- Use the approved C3 colors exactly: background `#F4F6F9`, surface `#FFFFFF`, accent surface `#E6EBFB`, ink `#131722`, muted `#697080`, line `#DCE1E9`, nav `#121A2D`, primary `#3159D7`, primary strong `#294BB5`, income `#19765D`, expense `#B84543`, chart accent `#D49F2F`.
- Income is always green and expense is always red; blue never carries money semantics.
- Use `lucide-vue-next` for interface icons; do not add hand-authored icon paths.
- Card/panel radius is at most 8px; controls use 5-6px; mobile sheets use 14px top corners.
- Mobile transaction rows use a 54px minimum height, a 30px category icon, 12px primary text, and 9-10px metadata.
- Mobile bottom navigation is 70px plus safe area with 20px icons, 11px labels, and a top active indicator.
- All interactive targets are at least 44x44px and all overlays restore focus on close.
- Financial writes are pessimistic: never update balances or transaction totals before the API succeeds.
- Every task follows RED -> GREEN -> REFACTOR and ends in one focused commit.

---

## File Structure

### Shared application layer

- `web/src/app/tabs.ts`: tab keys, labels, hashes, and Lucide icon component references.
- `web/src/composables/useHashTab.ts`: URL hash synchronization and browser navigation handling.
- `web/src/composables/useModalFocus.ts`: focus trap, Escape handling, focus restoration, and scroll locking.
- `web/src/lib/resourceInvalidation.ts`: typed resource version registry and dependency mapping.
- `web/src/lib/latestGate.ts`: stale-response rejection for rapidly changing reads.
- `web/src/components/AppShell.vue`: responsive structural wrapper.
- `web/src/components/DesktopNav.vue`: desktop top navigation.
- `web/src/components/MobileTabBar.vue`: approved mobile navigation.
- `web/src/components/PageHeader.vue`: page title, context, and primary action slot.
- `web/src/components/SummaryStrip.vue`: responsive primary and secondary metrics.
- `web/src/components/AsyncState.vue`: loading, empty, and read-error states.
- `web/src/components/AppSheet.vue`: mobile sheet and desktop form dialog.
- `web/src/components/ConfirmDialog.vue`: destructive confirmation dialog.

### Accounting

- `web/src/features/accounting/useTransactions.ts`: filters, request lifecycle, stale-response guard, pagination, and resource subscriptions.
- `web/src/features/accounting/TransactionTable.vue`: desktop transaction table.
- `web/src/features/accounting/TransactionList.vue`: compact grouped mobile list.
- `web/src/features/accounting/TransactionForm.vue`: responsive create/edit form.
- `web/src/features/accounting/AccountingPage.vue`: composition and detail/delete workflow.

### Assets

- `web/src/features/assets/useAssets.ts`: account, asset, member, summary, snapshot, and refresh state.
- `web/src/features/assets/AccountList.vue`: responsive account rows.
- `web/src/features/assets/AssetList.vue`: responsive asset rows.
- Existing account/asset/snapshot forms remain focused mutation components.

### Liabilities

- `web/src/features/liabilities/useLiabilities.ts`: liabilities, repayments, accounts, members, summary, and refresh state.
- `web/src/features/liabilities/LiabilityList.vue`: responsive liability rows and progress.
- Existing liability and repayment forms remain focused mutation components.

### Analysis and settings

- Existing chart files remain chart-only components.
- `AnalysisPage.vue` and `SettingsPage.vue` retain request ownership until their page-specific refactors are complete.

---

### Task 1: C3 Design System and Responsive Navigation

**Files:**
- Create: `web/src/app/tabs.ts`
- Create: `web/src/composables/useHashTab.ts`
- Create: `web/src/components/AppShell.vue`
- Create: `web/src/components/DesktopNav.vue`
- Create: `web/src/components/MobileTabBar.vue`
- Create: `web/src/components/PageHeader.vue`
- Modify: `web/src/App.vue`
- Modify: `web/src/styles/base.css`
- Modify: `web/src/App.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `TabKey`, `TAB_DEFINITIONS`, and `useHashTab(defaultTab)`.
- `useHashTab` returns `{ activeTab: Ref<TabKey>, setActiveTab(tab: TabKey): void }`.
- `AppShell` exposes default, `desktop-nav`, and `mobile-nav` slots.
- Later page tasks consume C3 CSS tokens, `.page-layout`, and `PageHeader`.

- [ ] **Step 1: Write failing navigation tests**

Replace the navigation assertions in `web/src/App.test.ts` with explicit hash and dual-navigation behavior:

```ts
it('reads a valid initial tab from the URL hash', async () => {
  window.location.hash = '#analysis';
  const wrapper = mount(App, { attachTo: document.body });
  await flush();
  expect(wrapper.get('[data-page="analysis"]').exists()).toBe(true);
  expect(wrapper.get('[aria-current="page"]').text()).toContain('分析');
});

it('updates the hash from either responsive navigation', async () => {
  const wrapper = mount(App, { attachTo: document.body });
  await flush();
  await wrapper.get('[data-mobile-tab="assets"]').trigger('click');
  expect(window.location.hash).toBe('#assets');
  expect(wrapper.get('[data-page="assets"]').exists()).toBe(true);
});

it('renders five labeled mobile icons with a single active item', async () => {
  const wrapper = mount(App, { attachTo: document.body });
  await flush();
  expect(wrapper.findAll('.mobile-tabbar__item')).toHaveLength(5);
  expect(wrapper.findAll('.mobile-tabbar__icon')).toHaveLength(5);
expect(wrapper.findAll('.mobile-tabbar__item[aria-current="page"]')).toHaveLength(1);
});
```

Extend the existing `beforeEach` with `window.location.hash = '#accounting'` so tests do not leak navigation state.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run web/src/App.test.ts`

Expected: FAIL because the new hash synchronization and responsive navigation selectors do not exist.

- [ ] **Step 3: Add the icon dependency**

Run: `npm install lucide-vue-next`

Expected: `package.json` and `package-lock.json` add `lucide-vue-next` without changing Vue or Vite versions.

- [ ] **Step 4: Implement tab definitions and hash synchronization**

Create `web/src/app/tabs.ts`:

```ts
import type { Component } from 'vue';
import { BookOpenText, Wallet, CreditCard, ChartNoAxesColumnIncreasing, Settings } from 'lucide-vue-next';

export const TAB_KEYS = ['accounting', 'assets', 'liabilities', 'analysis', 'settings'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_DEFINITIONS = [
  { key: 'accounting', label: '记账', icon: BookOpenText },
  { key: 'assets', label: '资产', icon: Wallet },
  { key: 'liabilities', label: '负债', icon: CreditCard },
  { key: 'analysis', label: '分析', icon: ChartNoAxesColumnIncreasing },
  { key: 'settings', label: '设置', icon: Settings },
] satisfies { key: TabKey; label: string; icon: Component }[];

export function tabFromHash(hash: string): TabKey | null {
  const key = hash.replace(/^#/, '');
  return TAB_KEYS.includes(key as TabKey) ? (key as TabKey) : null;
}
```

Create `web/src/composables/useHashTab.ts`:

```ts
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { tabFromHash, type TabKey } from '../app/tabs';

export function useHashTab(defaultTab: TabKey) {
  const activeTab = ref<TabKey>(tabFromHash(window.location.hash) ?? defaultTab);
  const sync = () => { activeTab.value = tabFromHash(window.location.hash) ?? defaultTab; };
  const setActiveTab = (tab: TabKey) => {
    if (window.location.hash !== `#${tab}`) window.location.hash = tab;
    activeTab.value = tab;
  };
  onMounted(() => window.addEventListener('hashchange', sync));
  onBeforeUnmount(() => window.removeEventListener('hashchange', sync));
  return { activeTab, setActiveTab };
}
```

- [ ] **Step 5: Implement shell and navigation components**

Use component icons from `TAB_DEFINITIONS` and preserve native buttons:

```vue
<!-- MobileTabBar.vue core -->
<button
  v-for="tab in tabs"
  :key="tab.key"
  type="button"
  class="mobile-tabbar__item"
  :data-mobile-tab="tab.key"
  :aria-current="modelValue === tab.key ? 'page' : undefined"
  @click="$emit('update:modelValue', tab.key)"
>
  <component :is="tab.icon" class="mobile-tabbar__icon" aria-hidden="true" />
  <span>{{ tab.label }}</span>
</button>
```

`App.vue` maps `activeTab` to the existing five page components, renders both navigation variants, and adds `data-page="<tab>"` to the current page wrapper.

- [ ] **Step 6: Replace global styles with the approved C3 tokens and shell geometry**

At the start of `web/src/styles/base.css`, define:

```css
:root {
  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface-accent: #e6ebfb;
  --ink: #131722;
  --muted: #697080;
  --line: #dce1e9;
  --nav: #121a2d;
  --primary: #3159d7;
  --primary-strong: #294bb5;
  --income: #19765d;
  --income-soft: #e4f1ed;
  --expense: #b84543;
  --expense-soft: #f7e9e8;
  --chart-accent: #d49f2f;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

Implement a 70px mobile bar with 20px icons, 11px labels, 44px targets, and the 24px top active indicator. Hide desktop navigation below 768px and hide mobile navigation at and above 768px.

- [ ] **Step 7: Run navigation tests, typecheck, and build**

Run: `npm test -- --run web/src/App.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0 and Vite emits the production bundle.

- [ ] **Step 8: Commit the shell**

```bash
git add package.json package-lock.json web/src/app web/src/composables/useHashTab.ts web/src/components/AppShell.vue web/src/components/DesktopNav.vue web/src/components/MobileTabBar.vue web/src/components/PageHeader.vue web/src/App.vue web/src/App.test.ts web/src/styles/base.css
git commit -m "feat(web): add responsive C3 application shell"
```

### Task 2: Resource-Specific Invalidation and Stale-Request Guard

**Files:**
- Create: `web/src/lib/resourceInvalidation.ts`
- Create: `web/src/lib/resourceInvalidation.test.ts`
- Create: `web/src/lib/latestGate.ts`
- Create: `web/src/lib/latestGate.test.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/api.test.ts`
- Delete after references migrate in Tasks 4-8: `web/src/lib/revision.ts`

**Interfaces:**
- Produces: `ResourceKey`, `resourceVersion(keys)`, `publishResources(keys)`, `resourcesForMutation(path, method)`.
- Produces: `createLatestGate()` with `run(loader)` returning `{ current, value }`.
- Existing `apiPost`, `apiPatch`, `apiPut`, and `apiDelete` signatures stay unchanged.

- [ ] **Step 1: Write failing resource and race tests**

Create `resourceInvalidation.test.ts`:

```ts
it('maps a repayment mutation to every affected resource', () => {
  expect(resourcesForMutation('/api/repayments', 'POST')).toEqual([
    'repayments', 'transactions', 'accounts', 'liabilities', 'statistics',
  ]);
});

it('includes rollback dependencies when deleting a liability', () => {
  expect(resourcesForMutation('/api/liabilities/1', 'DELETE')).toEqual([
    'liabilities', 'repayments', 'transactions', 'accounts', 'statistics',
  ]);
});

it('does not refresh family data after an asset mutation', () => {
  const before = resourceVersion(['family']).value;
  publishResources(resourcesForMutation('/api/assets', 'PATCH'));
  expect(resourceVersion(['family']).value).toBe(before);
});
```

Create `latestGate.test.ts`:

```ts
it('marks an older request stale when a newer request finishes first', async () => {
  const gate = createLatestGate();
  let release!: (value: string) => void;
  const old = gate.run(() => new Promise<string>((resolve) => { release = resolve; }));
  const fresh = await gate.run(async () => 'fresh');
  release('old');
  expect(fresh).toEqual({ current: true, value: 'fresh' });
  await expect(old).resolves.toEqual({ current: false, value: 'old' });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run web/src/lib/resourceInvalidation.test.ts web/src/lib/latestGate.test.ts`

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the typed resource registry**

Create `resourceInvalidation.ts` with the exact keys and mutation map:

```ts
import { computed, reactive } from 'vue';

export type ResourceKey = 'family' | 'members' | 'categories' | 'accounts' |
  'transactions' | 'assets' | 'liabilities' | 'repayments' | 'statistics';

const versions = reactive<Record<ResourceKey, number>>({
  family: 0, members: 0, categories: 0, accounts: 0, transactions: 0,
  assets: 0, liabilities: 0, repayments: 0, statistics: 0,
});

export function publishResources(keys: readonly ResourceKey[]) {
  for (const key of new Set(keys)) versions[key] += 1;
}

export function resourceVersion(keys: readonly ResourceKey[]) {
  return computed(() => keys.map((key) => versions[key]).join(':'));
}

export function resourcesForMutation(path: string, method: string): ResourceKey[] {
  if (path.startsWith('/api/repayments')) return ['repayments', 'transactions', 'accounts', 'liabilities', 'statistics'];
  if (path.startsWith('/api/transactions')) return ['transactions', 'accounts', 'statistics'];
  if (path.startsWith('/api/accounts')) return ['accounts', 'transactions', 'statistics'];
  if (path.startsWith('/api/assets')) return ['assets', 'statistics'];
  if (path.startsWith('/api/liabilities') && method === 'DELETE') {
    return ['liabilities', 'repayments', 'transactions', 'accounts', 'statistics'];
  }
  if (path.startsWith('/api/liabilities')) return ['liabilities', 'repayments', 'statistics'];
  if (path.startsWith('/api/members')) return ['members', 'transactions', 'assets', 'liabilities'];
  if (path.startsWith('/api/categories')) return ['categories'];
  if (path.startsWith('/api/family')) return ['family'];
  return [];
}
```

- [ ] **Step 4: Implement the latest-request gate**

Create `latestGate.ts`:

```ts
export function createLatestGate() {
  let sequence = 0;
  return {
    async run<T>(loader: () => Promise<T>) {
      const request = ++sequence;
      const value = await loader();
      return { current: request === sequence, value };
    },
  };
}
```

- [ ] **Step 5: Update mutation completion in the API client**

Change `afterWrite` in `api.ts` to invalidate only matching API cache prefixes and publish matching resource keys:

```ts
async function afterWrite(path: string, method: string): Promise<void> {
  const resources = resourcesForMutation(path, method);
  const prefixes = resources.map((resource) => `/api/${resource === 'statistics' ? 'stats' : resource}`);
  await Promise.all(prefixes.map((prefix) => invalidate(prefix)));
  publishResources(resources);
}
```

Pass `path` and the HTTP method from each mutation function, for example `await afterWrite(path, 'POST')`, and replace the revision assertion in `api.test.ts` with an assertion against `resourceVersion(['transactions'])`.

- [ ] **Step 6: Run library tests**

Run: `npm test -- --run web/src/lib/api.test.ts web/src/lib/resourceInvalidation.test.ts web/src/lib/latestGate.test.ts`

Expected: PASS with cache epoch protection retained.

- [ ] **Step 7: Commit resource invalidation**

```bash
git add web/src/lib/api.ts web/src/lib/api.test.ts web/src/lib/resourceInvalidation.ts web/src/lib/resourceInvalidation.test.ts web/src/lib/latestGate.ts web/src/lib/latestGate.test.ts
git commit -m "refactor(web): invalidate data by resource"
```

### Task 3: Accessible Overlays, Summary, and Async States

**Files:**
- Create: `web/src/composables/useModalFocus.ts`
- Create: `web/src/components/AsyncState.vue`
- Create: `web/src/components/AsyncState.test.ts`
- Create: `web/src/components/SummaryStrip.vue`
- Create: `web/src/components/SummaryStrip.test.ts`
- Modify: `web/src/components/AppSheet.vue`
- Create: `web/src/components/AppSheet.test.ts`
- Modify: `web/src/components/ConfirmDialog.vue`

**Interfaces:**
- `AsyncState` props: `loading`, `error`, `empty`, `emptyTitle`, `emptyHint`; emits `retry`.
- `SummaryStrip` props: `primary`, `secondary`; money values remain cents.
- `AppSheet` keeps `title`, `close`, and default slot interfaces so existing forms compile.

- [ ] **Step 1: Write failing shared-component tests**

```ts
it('shows retry without discarding slotted stale content', async () => {
  const wrapper = mount(AsyncState, {
    props: { loading: false, error: '加载失败', empty: false },
    slots: { default: '<p>旧数据</p>' },
  });
  expect(wrapper.text()).toContain('旧数据');
  expect(wrapper.text()).toContain('加载失败');
  await wrapper.get('button').trigger('click');
  expect(wrapper.emitted('retry')).toHaveLength(1);
});

it('closes a sheet with Escape and restores focus', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const wrapper = mount(AppSheet, { attachTo: document.body, props: { title: '记一笔' } });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(wrapper.emitted('close')).toHaveLength(1);
  wrapper.unmount();
  expect(document.activeElement).toBe(opener);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- --run web/src/components/AsyncState.test.ts web/src/components/SummaryStrip.test.ts web/src/components/AppSheet.test.ts`

Expected: FAIL because new components and focus behavior are missing.

- [ ] **Step 3: Implement modal focus behavior**

Create `useModalFocus.ts` with the focusable selector and lifecycle behavior below:

```ts
import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(root: Ref<HTMLElement | null>, onEscape: () => void): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return onEscape();
    if (event.key !== 'Tab' || !root.value) return;
    const nodes = [...root.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (nodes.length === 0) return event.preventDefault();
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  onMounted(async () => {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    root.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  });
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = previousOverflow;
    opener?.focus();
  });
}
```

Use it from `AppSheet.vue` and `ConfirmDialog.vue`; give each dialog a heading `id` and `aria-labelledby` instead of only `aria-label`.

- [ ] **Step 4: Implement `AsyncState` and `SummaryStrip`**

`AsyncState` renders four structure-matched skeleton rows only when loading and no slot data exists. When slot content exists, an error appears above it with a secondary retry button. Its branch order is:

```vue
<div v-if="loading && empty" class="skeleton-list" aria-label="加载中">...</div>
<div v-else-if="error && empty" class="async-error" role="alert">
  <span>{{ error }}</span><button type="button" class="btn" @click="$emit('retry')">重试</button>
</div>
<template v-else>
  <div v-if="error" class="async-error" role="alert">
    <span>{{ error }}</span><button type="button" class="btn" @click="$emit('retry')">重试</button>
  </div>
  <slot v-if="!empty" />
  <EmptyState v-else :title="emptyTitle" :hint="emptyHint" />
</template>
```

`SummaryStrip` renders one primary metric and up to two secondary metrics using `MoneyText`.

```ts
export interface SummaryMetric {
  label: string;
  cents: number;
  tone?: 'income' | 'expense' | 'neutral';
}
```

- [ ] **Step 5: Implement responsive overlay CSS**

Below 768px, `.sheet` is bottom-aligned. At 768px and above, it becomes the approved centered form dialog:

```css
.sheet { width: 100%; max-height: calc(100dvh - 58px); border-radius: 14px 14px 0 0; }
.sheet__close { min-width: 44px; min-height: 44px; }
@media (min-width: 768px) {
  .overlay { align-items: center; padding: 24px; }
  .sheet { max-width: 520px; max-height: min(760px, calc(100dvh - 48px)); border-radius: 8px; }
  .sheet__grip { display: none; }
}
```

- [ ] **Step 6: Run shared tests and typecheck**

Run: `npm test -- --run web/src/components/AsyncState.test.ts web/src/components/SummaryStrip.test.ts web/src/components/AppSheet.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit shared primitives**

```bash
git add web/src/composables/useModalFocus.ts web/src/components/AsyncState.vue web/src/components/AsyncState.test.ts web/src/components/SummaryStrip.vue web/src/components/SummaryStrip.test.ts web/src/components/AppSheet.vue web/src/components/AppSheet.test.ts web/src/components/ConfirmDialog.vue web/src/styles/base.css
git commit -m "feat(web): add accessible responsive UI primitives"
```

### Task 4: Accounting Workflow and Responsive Ledger

**Files:**
- Create: `web/src/features/accounting/useTransactions.ts`
- Create: `web/src/features/accounting/useTransactions.test.ts`
- Create: `web/src/features/accounting/TransactionTable.vue`
- Create: `web/src/features/accounting/TransactionList.vue`
- Create: `web/src/features/accounting/AccountingPage.test.ts`
- Create: `web/src/features/accounting/TransactionForm.test.ts`
- Modify: `web/src/features/accounting/AccountingPage.vue`
- Modify: `web/src/features/accounting/TransactionForm.vue`

**Interfaces:**
- `useTransactions()` owns `month`, filters, pagination, refs, totals, `load`, `loadMore`, and `reload`.
- `TransactionTable` and `TransactionList` receive `items` and emit `select(transaction)`.
- `TransactionForm` preserves its current props and emits.

- [ ] **Step 1: Write failing accounting tests**

Add assertions for the approved mobile anatomy and pessimistic save:

```ts
it('renders compact mobile rows with category icons and signed amounts', async () => {
  const wrapper = mount(AccountingPage, { attachTo: document.body });
  await flushPromises();
  const row = wrapper.get('[data-mobile-transaction="1"]');
  expect(row.classes()).toContain('transaction-mobile-row');
  expect(row.get('svg').exists()).toBe(true);
  expect(row.text()).toContain('- ¥186.00');
});

it('keeps the form open and preserves input after a failed save', async () => {
  mockedApiPost.mockRejectedValueOnce(new ApiError(500, 'SAVE_FAILED', '保存失败'));
  const wrapper = mount(TransactionForm, { props: baseProps, attachTo: document.body });
  await wrapper.get('[aria-label="金额"]').setValue('186');
  await wrapper.get('[data-submit-transaction]').trigger('click');
  await flushPromises();
  expect(document.body.textContent).toContain('保存失败');
  expect((document.querySelector('[aria-label="金额"]') as HTMLInputElement).value).toBe('186');
  expect(wrapper.emitted('saved')).toBeUndefined();
});
```

- [ ] **Step 2: Run accounting tests and confirm RED**

Run: `npm test -- --run web/src/features/accounting/AccountingPage.test.ts web/src/features/accounting/TransactionForm.test.ts web/src/features/accounting/useTransactions.test.ts`

Expected: FAIL because the composable, responsive displays, and selectors are missing.

- [ ] **Step 3: Implement `useTransactions` with stale-response protection**

Use `createLatestGate()` around the transaction list request. Apply results only when `current` is true. Watch resource versions separately and preserve prior items while a refresh is in flight:

```ts
const listGate = createLatestGate();
const transactionVersion = resourceVersion(['transactions']);
const referenceVersion = resourceVersion(['accounts', 'members', 'categories']);

async function load(options: { force?: boolean; append?: boolean } = {}) {
  if (items.value.length === 0) loading.value = true;
  else refreshing.value = true;
  error.value = null;
  try {
    const result = await listGate.run(() => cachedGet<TransactionsResponse>(
      '/api/transactions', requestParams(), { force: options.force },
    ));
    if (!result.current) return;
    items.value = options.append ? [...items.value, ...result.value.items] : result.value.items;
    totals.value = {
      income: result.value.incomeTotalCents,
      expense: result.value.expenseTotalCents,
      net: result.value.netCents,
    };
    total.value = result.value.total;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '流水加载失败';
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

watch(transactionVersion, () => load({ force: true }));
watch(referenceVersion, () => loadReferences(true));
```

Return this stable interface:

```ts
return {
  month, type, accountFilter, memberFilter, items, totals, total,
  accounts, members, expenseCategories, incomeCategories,
  loading, refreshing, error, hasMore, load, loadMore, reload,
};
```

- [ ] **Step 4: Implement desktop table and approved compact mobile list**

Desktop uses columns category/note, account, member, and amount. Mobile groups by date and each row uses:

```css
.transaction-mobile-row {
  min-height: 54px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 7px 11px;
}
```

Map category names to Lucide icons with a deterministic fallback `CircleDollarSign`. Do not render edit or delete buttons in either list.

- [ ] **Step 5: Refactor the page and form**

Compose `PageHeader`, `SummaryStrip`, `AsyncState`, table/list, detail sheet, and confirm dialog. Keep all current filters, pagination, transaction types, inline category creation, default account/member/category behavior, transfer validation, repayment deletion protection, and API payloads:

```vue
<PageHeader title="月度账本" :context="monthLabel(month)">
  <template #action><button class="btn btn--primary" @click="openCreate">记一笔</button></template>
</PageHeader>
<SummaryStrip :primary="netMetric" :secondary="[incomeMetric, expenseMetric]" />
<AsyncState :loading="loading" :error="error" :empty="items.length === 0" @retry="reload">
  <TransactionTable class="desktop-only" :items="items" @select="openDetail" />
  <TransactionList class="mobile-only" :items="items" @select="openDetail" />
</AsyncState>
```

The submit button must expose `data-submit-transaction`, show `保存中…` while pending, and remain in the overlay when a request fails.

- [ ] **Step 6: Run accounting tests and the current API tests**

Run: `npm test -- --run web/src/features/accounting web/src/lib/api.test.ts`

Expected: PASS.

- [ ] **Step 7: Browser checkpoint for the primary workflow**

Start the app with `npm run dev`. At 1440x900 and 390x844 verify:

`#accounting -> click 记一笔/FAB -> enter amount -> choose category -> save -> overlay closes -> new row appears at top`.

Capture screenshots outside the repo and compare the mobile list/nav against `.superpowers/brainstorm/9619-1789723320/content/mobile-density-nav-v2.html`.

- [ ] **Step 8: Commit accounting**

```bash
git add web/src/features/accounting web/src/styles/base.css
git commit -m "feat(web): rebuild the responsive accounting workflow"
```

### Task 5: Assets Workspace

**Files:**
- Create: `web/src/features/assets/useAssets.ts`
- Create: `web/src/features/assets/useAssets.test.ts`
- Create: `web/src/features/assets/AccountList.vue`
- Create: `web/src/features/assets/AssetList.vue`
- Modify: `web/src/features/assets/AssetsPage.vue`
- Modify: `web/src/features/assets/AssetsPage.test.ts`
- Modify: `web/src/features/assets/AccountForm.vue`
- Modify: `web/src/features/assets/AssetForm.vue`
- Modify: `web/src/features/assets/AssetSnapshotForm.vue`

**Interfaces:**
- `useAssets()` returns summary, accounts, assets, members, snapshots, async state, and reload functions.
- Lists emit `select-account` and `select-asset`; no low-frequency row actions are visible.

- [ ] **Step 1: Add failing responsive and resource tests**

```ts
it('renders separate account and asset groups with whole-row detail actions', async () => {
  wrapper = mount(AssetsPage, { attachTo: document.body });
  await settle();
  expect(document.querySelector('[data-account-list]')).toBeTruthy();
  expect(document.querySelector('[data-asset-list]')).toBeTruthy();
  expect(document.querySelector('[data-account-row="1"] .row__actions')).toBeNull();
});

it('reloads assets and statistics but not members after an asset update', async () => {
  const state = useAssets();
  await state.load();
  mockedCachedGet.mockClear();
  publishResources(['assets', 'statistics']);
  await flushPromises();
  expect(mockedCachedGet).toHaveBeenCalledWith('/api/assets', undefined, { force: true });
  expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/members', undefined, { force: true });
});
```

- [ ] **Step 2: Run assets tests and confirm RED**

Run: `npm test -- --run web/src/features/assets`

Expected: FAIL because the composable and new list selectors do not exist.

- [ ] **Step 3: Implement `useAssets` and list components**

Move request state from the 648-line page into `useAssets`. Subscribe to `accounts`, `assets`, `members`, and `statistics` independently. Keep snapshot loading keyed to the selected asset:

```ts
const accountVersion = resourceVersion(['accounts']);
const assetVersion = resourceVersion(['assets']);
const memberVersion = resourceVersion(['members']);
const statisticsVersion = resourceVersion(['statistics']);

watch(accountVersion, () => loadAccounts(true));
watch(assetVersion, () => loadAssets(true));
watch(memberVersion, () => loadMembers(true));
watch(statisticsVersion, () => loadSummary(true));

async function loadSnapshots(assetId: number, force = false) {
  snapshots.value = await cachedGet<AssetSnapshot[]>(
    `/api/assets/${assetId}/snapshots`, undefined, { force },
  );
}
```

Desktop renders two side-by-side groups at 1024px; mobile stacks compact list groups. Negative balances retain the explicit `余额为负` text in addition to red color.

- [ ] **Step 4: Recompose the page and preserve workflows**

Use `SummaryStrip` for net worth/total assets/total liabilities. Keep create/edit account, calibration, set-default, account-in-use error, asset create/edit/delete, snapshot history, and snapshot creation behavior unchanged:

```vue
<SummaryStrip :primary="netWorthMetric" :secondary="[assetsMetric, liabilitiesMetric]" />
<div class="asset-groups">
  <AccountList :accounts="accounts" :members="members" @select="openAccount" />
  <AssetList :assets="assets" :members="members" @select="openAsset" />
</div>
```

Forms expose pending labels and preserve values on API errors:

```vue
<button class="btn btn--primary" :disabled="saving">
  {{ saving ? '保存中…' : '保存' }}
</button>
```

- [ ] **Step 5: Run assets tests and typecheck**

Run: `npm test -- --run web/src/features/assets`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit assets**

```bash
git add web/src/features/assets
git commit -m "feat(web): rebuild the responsive assets workspace"
```

### Task 6: Liabilities and Repayment Workflow

**Files:**
- Create: `web/src/features/liabilities/useLiabilities.ts`
- Create: `web/src/features/liabilities/useLiabilities.test.ts`
- Create: `web/src/features/liabilities/LiabilityList.vue`
- Modify: `web/src/features/liabilities/LiabilitiesPage.vue`
- Modify: `web/src/features/liabilities/LiabilitiesPage.test.ts`
- Modify: `web/src/features/liabilities/LiabilityForm.vue`
- Modify: `web/src/features/liabilities/RepaymentForm.vue`
- Modify: `web/src/features/liabilities/RepaymentList.vue`

**Interfaces:**
- `useLiabilities()` returns liabilities, repayments, accounts, members, summary, async state, and resource-scoped reloads.
- `LiabilityList` emits `select` and `repay`; `repay` remains the only inline high-frequency action.

- [ ] **Step 1: Add failing liability tests**

```ts
it('shows remaining principal, progress, and one inline repay action', async () => {
  wrapper = mount(LiabilitiesPage, { attachTo: document.body });
  await settle();
  const row = document.querySelector('[data-liability-row="1"]')!;
  expect(row.textContent).toContain('房贷');
  expect(row.querySelector('[role="progressbar"]')).toBeTruthy();
  expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['还一笔']);
});

it('publishes all repayment dependencies after save', () => {
  expect(resourcesForMutation('/api/repayments', 'POST')).toEqual([
    'repayments', 'transactions', 'accounts', 'liabilities', 'statistics',
  ]);
});
```

- [ ] **Step 2: Run liabilities tests and confirm RED**

Run: `npm test -- --run web/src/features/liabilities`

Expected: FAIL because the new list and composable do not exist.

- [ ] **Step 3: Implement liability data ownership and list**

Move page requests into `useLiabilities`. Load repayment history only for selected liabilities. Derive progress from recorded repayment history plus current remaining principal, matching the existing calculation:

```ts
function progressOf(liability: Liability, repayments: Repayment[]): number {
  const paid = repayments
    .filter((item) => item.liability_id === liability.id)
    .reduce((sum, item) => sum + item.amount_cents, 0);
  const remaining = parseYuanToCents(liability.remaining) ?? 0;
  const original = paid + remaining;
  return original > 0 ? Math.min(1, Math.max(0, paid / original)) : 0;
}
```

- [ ] **Step 4: Recompose page and forms**

Use `PageHeader`, `SummaryStrip`, `AsyncState`, responsive list/table, detail overlay, repayment history, and confirmation dialogs:

```vue
<AsyncState :loading="loading" :error="error" :empty="liabilities.length === 0" @retry="reload">
  <LiabilityList
    :liabilities="liabilities"
    :repayments="repayments"
    @select="openDetail"
    @repay="openRepayment"
  />
</AsyncState>
```

Preserve default monthly repayment, manual amount fallback, overpayment errors, account selection, reverse rollback on delete, and liability deletion warnings.

- [ ] **Step 5: Run liabilities tests**

Run: `npm test -- --run web/src/features/liabilities`

Expected: PASS.

- [ ] **Step 6: Commit liabilities**

```bash
git add web/src/features/liabilities
git commit -m "feat(web): rebuild liabilities and repayment UX"
```

### Task 7: Analysis Dashboard

**Files:**
- Modify: `web/src/features/analysis/AnalysisPage.vue`
- Modify: `web/src/features/analysis/AnalysisPage.test.ts`
- Modify: `web/src/features/analysis/charts/TrendChart.vue`
- Modify: `web/src/features/analysis/charts/DonutChart.vue`
- Modify: `web/src/features/analysis/charts/palette.ts`

**Interfaces:**
- Preserve `/api/stats/monthly-snapshot` and `/api/stats/monthly-trend` reads.
- Charts remain pure prop-driven components and do not fetch data.

- [ ] **Step 1: Add failing visual-structure tests**

```ts
it('renders paired income/expense bars and direct category percentages', async () => {
  wrapper = mount(AnalysisPage, { attachTo: document.body });
  await settle();
  expect(document.querySelectorAll('[data-series="income"]')).toHaveLength(6);
  expect(document.querySelectorAll('[data-series="expense"]')).toHaveLength(6);
  expect(document.body.textContent).toContain('38%');
});

it('shows an actionable empty state instead of an empty chart frame', async () => {
  setupEmptyStats();
  wrapper = mount(AnalysisPage, { attachTo: document.body });
  await settle();
  expect(document.querySelector('[data-empty-analysis]')).toBeTruthy();
  expect(document.querySelector('[data-chart-frame]')).toBeNull();
});
```

- [ ] **Step 2: Run analysis tests and confirm RED**

Run: `npm test -- --run web/src/features/analysis`

Expected: FAIL because the new series and empty-state selectors are missing.

- [ ] **Step 3: Apply the C3 dashboard composition**

Use `PageHeader`, month selection, `SummaryStrip`, paired bars, and horizontal category bars. Use only existing API fields; do not add fake savings or comparison metrics:

```vue
<SummaryStrip :primary="netMetric" :secondary="[incomeMetric, expenseMetric]" />
<TrendChart v-if="trend.length" :data="trend" data-chart-frame />
<AsyncState
  v-else
  data-empty-analysis
  :loading="loading"
  :error="error"
  :empty="true"
  empty-title="暂无收支数据"
  @retry="reload"
/>
```

Keep direct labels legible at 360px and use `--chart-accent` only for a secondary category series.

- [ ] **Step 4: Add resource-scoped refresh and stale request protection**

Watch `resourceVersion(['statistics'])`, use `createLatestGate()` for month changes, preserve the previous snapshot during refresh, and render an inline retry on failure:

```ts
const gate = createLatestGate();
const statisticsVersion = resourceVersion(['statistics']);
watch([month, statisticsVersion], () => load(true));

async function load(force = false) {
  refreshing.value = snapshot.value !== null;
  const result = await gate.run(() => Promise.all([
    cachedGet<MonthSnapshot>('/api/stats/monthly-snapshot', { month: month.value }, { force }),
    cachedGet<TrendPoint[]>('/api/stats/monthly-trend', { months: 6, end: month.value }, { force }),
  ]));
  if (!result.current) return;
  [snapshot.value, trend.value] = result.value;
  refreshing.value = false;
}
```

- [ ] **Step 5: Run analysis tests and typecheck**

Run: `npm test -- --run web/src/features/analysis`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit analysis**

```bash
git add web/src/features/analysis
git commit -m "feat(web): rebuild the analysis dashboard"
```

### Task 8: Settings and Family Management

**Files:**
- Modify: `web/src/features/settings/SettingsPage.vue`
- Modify: `web/src/features/settings/SettingsPage.test.ts`

**Interfaces:**
- Preserve family and member API payloads.
- Subscribe separately to `family` and `members` resources.

- [ ] **Step 1: Add failing settings interaction tests**

```ts
it('uses quiet grouped rows and opens member editing from the whole row', async () => {
  wrapper = mount(SettingsPage, { attachTo: document.body });
  await settle();
  const row = document.querySelector('[data-member-row="1"]') as HTMLButtonElement;
  expect(row).toBeTruthy();
  row.click();
  await settle();
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});

it('preserves the family name when saving fails', async () => {
  mockedApiPut.mockRejectedValueOnce(new ApiError(500, 'SAVE_FAILED', '保存失败'));
  wrapper = mount(SettingsPage, { attachTo: document.body });
  await settle();
  setInput(fieldInput('家庭名称')!, '新家');
  clickBtn('保存');
  await settle();
  expect((fieldInput('家庭名称') as HTMLInputElement).value).toBe('新家');
  expect(document.body.textContent).toContain('保存失败');
});
```

- [ ] **Step 2: Run settings tests and confirm RED**

Run: `npm test -- --run web/src/features/settings`

Expected: FAIL because grouped row selectors and overlay editing are missing.

- [ ] **Step 3: Recompose settings**

Render family and member sections as un-nested, quiet groups. Move add/edit member forms into the responsive overlay:

```vue
<section class="settings-group" aria-labelledby="members-heading">
  <div class="settings-group__head">
    <h2 id="members-heading">家庭成员</h2>
    <button class="btn btn--ghost" @click="openCreateMember">添加成员</button>
  </div>
  <button
    v-for="member in members"
    :key="member.id"
    type="button"
    class="settings-row"
    :data-member-row="member.id"
    @click="openEditMember(member)"
  >
    <span>{{ member.name }}</span><ChevronRight aria-hidden="true" />
  </button>
</section>
```

Keep color selection, empty-name guards, deletion confirmation, and the exact family-ownership explanation.

Watch `resourceVersion(['family'])` and `resourceVersion(['members'])` separately so changing the family name does not reload members:

```ts
watch(resourceVersion(['family']), () => loadFamily(true));
watch(resourceVersion(['members']), () => loadMembers(true));
```

- [ ] **Step 4: Run settings and app tests**

Run: `npm test -- --run web/src/features/settings web/src/App.test.ts`

Expected: PASS and the shell family name updates after save.

- [ ] **Step 5: Commit settings**

```bash
git add web/src/features/settings web/src/App.vue web/src/App.test.ts
git commit -m "feat(web): rebuild family settings UX"
```

### Task 9: Remove Legacy UI, Verify, and Perform Fidelity QA

**Files:**
- Delete when `rg` shows no imports: `web/src/components/TabBar.vue`
- Delete when `rg` shows no imports: `web/src/components/StatHero.vue`
- Delete when `rg` shows no imports: `web/src/components/StatBlock.vue`
- Delete when `rg` shows no imports: `web/src/components/SectionBlock.vue`
- Delete when `rg` shows no imports: `web/src/lib/revision.ts`
- Modify: `web/src/styles/base.css`
- Modify: affected tests that still assert legacy class names

**Interfaces:**
- Final app contains no legacy oat/caramel tokens or broad revision watcher.
- No production interface changes are introduced in this cleanup task.

- [ ] **Step 1: Prove legacy modules are unreferenced**

Run:

```bash
rg -n "TabBar|StatHero|StatBlock|SectionBlock|revision|bumpRevision|--paper|--brand" web/src
```

Expected: references exist only inside the legacy files themselves or test descriptions. If an active import remains, migrate it to the new component/token before deleting anything.

- [ ] **Step 2: Remove legacy files and CSS only after the reference check passes**

Delete the listed files with `apply_patch`, then prove no imports remain:

```bash
rg -n "TabBar|StatHero|StatBlock|SectionBlock|revision|bumpRevision|--paper|--brand" web/src
```

Expected: no output. Keep only C3 tokens and selectors used by active components in `base.css`.

- [ ] **Step 3: Run complete automated verification**

Run: `npm test`

Expected: all server and web projects PASS.

Run: `npm run typecheck`

Expected: exit 0 with no Vue or TypeScript errors.

Run: `npm run build`

Expected: exit 0 with a production bundle and no missing assets.

- [ ] **Step 4: Run browser QA through the available path**

The Browser plugin is not listed in this session, so use regular Playwright as the documented fallback. Start `npm run dev`, then verify at 1440x900, 900x1024, 390x844, and 360x800:

```text
#accounting -> create expense -> row appears -> open detail -> edit -> delete confirmation
#assets -> create/open account -> calibrate -> create/open asset -> add snapshot
#liabilities -> open liability -> record repayment -> repayment appears
#analysis -> change month -> charts update or empty state appears
#settings -> rename family -> add/edit/delete member
```

For every viewport, check page identity, nonblank content, no Vite overlay, no relevant console warnings/errors, no horizontal overflow, no clipped controls, and no text overlap.

- [ ] **Step 5: Capture and inspect fidelity screenshots**

Save screenshots outside the repo, including desktop accounting, mobile accounting, mobile transaction entry, assets, liabilities, analysis, and settings. First render each HTML concept to PNG with a temporary Playwright script, then use `view_image` on:

1. The PNG rendered from `.superpowers/brainstorm/9619-1789723320/content/c3-complete-app.html` at the concept dimensions.
2. The PNG rendered from `.superpowers/brainstorm/9619-1789723320/content/mobile-density-nav-v2.html` at the concept dimensions.
3. The latest desktop and mobile implementation screenshots.

Record a fidelity ledger covering at least copy, layout, typography, colors, icons, spacing, responsive behavior, and interactions. Fix every material mismatch before continuing.

- [ ] **Step 6: Run the above-the-fold copy diff**

Allowed accounting first-viewport copy is limited to the family/product name, selected month, `记一笔`, `本月结余`, `收入`, `支出`, transaction filters, date groups, transaction content, and the five navigation labels. Remove any unapproved eyebrow, badge, tutorial, keyboard shortcut, or promotional copy.

- [ ] **Step 7: Commit cleanup and QA fixes**

```bash
git add web package.json package-lock.json
git commit -m "chore(web): finish responsive redesign and QA"
```

## Completion Gate

Do not report completion until:

- All nine task commits exist.
- `npm test`, `npm run typecheck`, and `npm run build` pass from a clean process.
- Browser QA covers the five primary pages and the transaction form on desktop and mobile.
- The accepted concept and final screenshots have both been inspected with `view_image`.
- The fidelity ledger has no unresolved material mismatch.
- `git status --short` contains only the intentionally untracked `.superpowers/` design companion directory, unless the user chooses to ignore or remove it.
