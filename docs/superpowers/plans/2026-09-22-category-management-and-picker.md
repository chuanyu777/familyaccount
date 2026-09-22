# Category Management and Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let households safely manage categories and choose among many categories quickly from the transaction form.

**Architecture:** Category lifecycle remains in the Node service, which returns active categories by default and protects historical records through archive semantics. The Vue settings page manages each kind, while the transaction form receives active lists and derives six common categories from pinned status and transaction recency.

**Tech Stack:** Node 22 SQLite, Express 4, Zod, Vue 3, lucide-vue-next, Vitest, Vue Test Utils, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-22-access-control-and-category-management-design.md`

## Global Constraints

- Add `is_archived` and `is_pinned`, defaulting to false for existing categories.
- Normal category reads return active categories only; management can request archived rows.
- Default categories `其他` and `其他收入` cannot be archived or deleted.
- Used custom categories must be archived, never deleted.
- Rename must preserve category IDs and historical/report visibility.
- The form has exactly six common slots plus `All` and `New category`.
- Common ordering is pinned first, then most recently used active categories, with stable fallback order.

---

## File Structure

- Modify: `server/src/db/schema.sql` - add category lifecycle fields and indexes with an idempotent existing-database migration path.
- Modify: `server/src/db/connection.ts` - run `ensureCategoryColumns(db)` after schema creation so existing SQLite files gain both columns.
- Modify: `server/src/services/categories.ts` - lifecycle operations, default protection, reference checks, active/filter reads, and common ranking.
- Modify: `server/src/services/categories.test.ts` - direct service lifecycle and ranking coverage.
- Modify: `server/src/routes/category.routes.ts` - validated list, update, archive, restore, and delete endpoints.
- Modify: `server/src/routes/category.routes.test.ts` - HTTP lifecycle/conflict coverage.
- Modify: `server/src/services/ledger.ts` - reject archived categories in new or updated transactions; allow a historical archived category only when unchanged during edit.
- Modify: `server/src/services/ledger.test.ts` - transaction/category integration tests.
- Modify: `web/src/features/accounting/types.ts` - extend `Category` with archive/pin fields.
- Modify: `web/src/features/accounting/AccountingPage.vue` - load and pass each kind's common-category list alongside active categories.
- Modify: `web/src/features/accounting/AccountingPage.test.ts` - add common-category resource mocks and refresh assertions.
- Create: `web/src/features/accounting/CategoryPicker.vue` - fixed grid and searchable all-category sheet.
- Create: `web/src/features/accounting/CategoryPicker.test.ts` - picker interaction and visibility tests.
- Modify: `web/src/features/accounting/TransactionForm.vue` - delegate category selection to `CategoryPicker` and retain inline create/save behavior.
- Modify: `web/src/features/accounting/TransactionForm.test.ts` - update form contracts around picker events.
- Create: `web/src/features/settings/CategoryManager.vue` - category listing, edit sheet, action menu, and confirmation states.
- Create: `web/src/features/settings/CategoryManager.test.ts` - management lifecycle UI coverage.
- Modify: `web/src/features/settings/SettingsPage.vue` - host CategoryManager and Lock-this-device affordance from the access-control plan.
- Modify: `web/src/features/settings/SettingsPage.test.ts` - mock categories and assert management entry.

### Task 1: Make Category State Durable and Backward-Compatible

**Files:**
- Modify: `server/src/db/schema.sql`
- Modify: `server/src/db/connection.ts`
- Test: `server/src/services/categories.test.ts`

**Interfaces:**
- Produces: category records with integer `is_archived` and `is_pinned` values constrained to `0` or `1`.
- Consumes: existing SQLite files created before the new columns existed.

- [ ] **Step 1: Write the migration regression test**

```ts
const db = openLegacyFixtureWithoutCategoryFlags();
ensureCategoryColumns(db);
const row = db.prepare('SELECT is_archived, is_pinned FROM category WHERE id = 1').get();
expect(row).toMatchObject({ is_archived: 0, is_pinned: 0 });
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- server/src/services/categories.test.ts`

Expected: FAIL because the existing schema lacks both columns.

- [ ] **Step 3: Add schema fields and idempotent migration**

```sql
is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
is_pinned   INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
```

`ensureCategoryColumns(db)` must inspect `PRAGMA table_info(category)` and issue one `ALTER TABLE category ADD COLUMN ...` only for each missing column. Add an index supporting `kind, is_archived, is_pinned, id` reads.

- [ ] **Step 4: Run focused database tests**

Run: `npm test -- server/src/services/categories.test.ts server/src/db/seed.test.ts`

Expected: PASS for new and legacy-shaped databases.

- [ ] **Step 5: Commit schema compatibility**

```bash
git add server/src/db/schema.sql server/src/db/connection.ts server/src/services/categories.test.ts
git commit -m "feat: persist category archive and pin state"
```

### Task 2: Implement Category Lifecycle and Common Ranking

**Files:**
- Modify: `server/src/services/categories.ts`
- Modify: `server/src/services/categories.test.ts`
- Modify: `server/src/services/ledger.ts`
- Modify: `server/src/services/ledger.test.ts`

**Interfaces:**
- Produces: `CategoryRow` with `isArchived: boolean` and `isPinned: boolean`; `listCategories(db, kind, { includeArchived? })`; `renameCategory`; `setCategoryPinned`; `archiveCategory`; `restoreCategory`; `deleteCategory`; `listCommonCategories(db, kind, limit = 6)`.
- Consumes: `txn.category_id` references and existing `ensureDefaultCategory`.

- [ ] **Step 1: Write failing service tests**

```ts
const used = upsertCategory(db, { kind: 'expense', name: '餐饮' });
createTransaction(db, { type: 'expense', amount: 20, categoryId: used.id });
expect(() => deleteCategory(db, used.id)).toThrow(expect.objectContaining({ code: 'CATEGORY_IN_USE' }));
archiveCategory(db, used.id);
expect(listCategories(db, 'expense').map((c) => c.id)).not.toContain(used.id);
expect(listCategories(db, 'expense', { includeArchived: true }).find((c) => c.id === used.id)?.isArchived).toBe(true);
```

Add tests for default protection, permanent deletion of unused custom categories, restore, rename collision, and ranking where two pinned categories appear before recency-derived entries.

- [ ] **Step 2: Run service tests to verify failure**

Run: `npm test -- server/src/services/categories.test.ts server/src/services/ledger.test.ts`

Expected: FAIL because lifecycle functions and archive fields do not exist.

- [ ] **Step 3: Implement lifecycle validation and ranking**

```ts
export function listCommonCategories(db: Db, kind: CategoryKind, limit = 6): CategoryRow[] {
  return db.prepare(`
    SELECT c.id, c.kind, c.name, c.is_archived, c.is_pinned, c.created_at,
           MAX(t.occurred_on) AS last_used_on, MAX(t.id) AS last_used_id
    FROM category c LEFT JOIN txn t ON t.category_id = c.id
    WHERE c.kind = ? AND c.is_archived = 0
    GROUP BY c.id
    ORDER BY c.is_pinned DESC, last_used_on DESC, last_used_id DESC, c.id ASC
    LIMIT ?
  `).all(kind, limit).map(toCategoryRow);
}
```

Before writing a transaction, verify a supplied category ID exists, matches its transaction kind, and is active. Preserve an existing archived category only if an edit leaves `categoryId` unchanged. Continue using `categoryName` only to create or select an active category. When create/upsert receives the name of an archived category of the same kind, restore and return that existing category instead of creating a duplicate name or returning an unusable archived selection.

- [ ] **Step 4: Run service and ledger tests**

Run: `npm test -- server/src/services/categories.test.ts server/src/services/ledger.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit service lifecycle**

```bash
git add server/src/services/categories.ts server/src/services/categories.test.ts server/src/services/ledger.ts server/src/services/ledger.test.ts
git commit -m "feat: support category archive pin and ranking"
```

### Task 3: Expose Lifecycle Through the Category API

**Files:**
- Modify: `server/src/routes/category.routes.ts`
- Modify: `server/src/routes/category.routes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/categories?kind=expense&includeArchived=true`
  - `GET /api/categories/common?kind=expense`
  - `PATCH /api/categories/:id` with `{ name?: string, isPinned?: boolean }`
  - `POST /api/categories/:id/archive`
  - `POST /api/categories/:id/restore`
  - `DELETE /api/categories/:id`
- Consumes: Task 2 category functions and `parseIdParam`.

- [ ] **Step 1: Write failing endpoint tests**

```ts
await request(app).post(`/api/categories/${id}/archive`).expect(200);
await request(app).get('/api/categories?kind=expense').expect(({ body }) => {
  expect(body.some((category: { id: number }) => category.id === id)).toBe(false);
});
await request(app).delete(`/api/categories/${usedId}`).expect(409);
await request(app).patch(`/api/categories/${id}`).send({ isPinned: true }).expect(200);
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm test -- server/src/routes/category.routes.test.ts`

Expected: FAIL because the lifecycle routes are absent.

- [ ] **Step 3: Validate requests and map service errors**

```ts
const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  isPinned: z.boolean().optional(),
}).refine((body) => body.name !== undefined || body.isPinned !== undefined, '至少提供一项修改');
```

Use status 409 for `CATEGORY_IN_USE` and protected-default conflicts; retain the existing error middleware response shape.

- [ ] **Step 4: Run API and smoke checks**

Run: `npm test -- server/src/routes/category.routes.test.ts server/src/smoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit category endpoints**

```bash
git add server/src/routes/category.routes.ts server/src/routes/category.routes.test.ts
git commit -m "feat: expose category lifecycle API"
```

### Task 4: Build the Reusable Fixed-Grid Category Picker

**Files:**
- Modify: `web/src/features/accounting/types.ts`
- Modify: `web/src/features/accounting/AccountingPage.vue`
- Modify: `web/src/features/accounting/AccountingPage.test.ts`
- Create: `web/src/features/accounting/CategoryPicker.vue`
- Create: `web/src/features/accounting/CategoryPicker.test.ts`
- Modify: `web/src/features/accounting/TransactionForm.vue`
- Modify: `web/src/features/accounting/TransactionForm.test.ts`

**Interfaces:**
- `CategoryPicker` props: `{ categories: Category[]; commonCategories: Category[]; modelValue?: number; includeArchivedId?: number }`.
- `CategoryPicker` emits: `update:modelValue` with a category ID, `create`, and `manage`.
- `Category` adds `isArchived` and `isPinned` fields.
- `AccountingPage` loads `GET /api/categories/common?kind=expense` and `GET /api/categories/common?kind=income`, then passes both lists to `TransactionForm`.

- [ ] **Step 1: Write failing picker component tests**

```ts
expect(wrapper.findAll('[data-category-slot]')).toHaveLength(8);
await wrapper.get('[data-category-all]').trigger('click');
await wrapper.get('input[aria-label="搜索分类"]').setValue('医疗');
expect(wrapper.text()).toContain('医疗健康');
await wrapper.get('[data-category-id="9"]').trigger('click');
expect(wrapper.emitted('update:modelValue')).toEqual([[9]]);
```

Also test hidden archived categories for create mode, retained-and-labelled archived category for edit mode, and `manage` from the sheet.

- [ ] **Step 2: Run picker tests to verify failure**

Run: `npm test -- web/src/features/accounting/CategoryPicker.test.ts`

Expected: FAIL because `CategoryPicker.vue` does not exist.

- [ ] **Step 3: Implement fixed slots and accessible all-category sheet**

```vue
<button v-for="category in visibleCommon" :key="category.id" data-category-slot type="button"
  :aria-pressed="modelValue === category.id" @click="$emit('update:modelValue', category.id)">
  {{ category.name }}
</button>
<button data-category-all type="button" @click="allOpen = true">全部</button>
<button type="button" @click="$emit('create')">新分类</button>
```

`visibleCommon` always caps at six, filtering archived categories except an `includeArchivedId`. The bottom sheet uses `AppSheet`, autofocuses its search field, filters names client-side, and closes after selection. TransactionForm supplies common categories from the API and keeps its existing inline-new-category flow. Extend `AccountingPage` reference loading and resource invalidation to refresh the two common-category lists whenever a transaction or category write succeeds. Add an `AccountingPage.test.ts` case that mocks both `/common` requests and proves they are passed to the opened transaction form.

- [ ] **Step 4: Run picker and transaction-form tests**

Run: `npm test -- web/src/features/accounting/CategoryPicker.test.ts web/src/features/accounting/TransactionForm.test.ts`

Expected: PASS; existing payload assertions still include selected category ID and name.

- [ ] **Step 5: Commit picker integration**

```bash
git add web/src/features/accounting/types.ts web/src/features/accounting/AccountingPage.vue web/src/features/accounting/AccountingPage.test.ts web/src/features/accounting/CategoryPicker.vue web/src/features/accounting/CategoryPicker.test.ts web/src/features/accounting/TransactionForm.vue web/src/features/accounting/TransactionForm.test.ts
git commit -m "feat: add searchable category picker"
```

### Task 5: Add Settings Category Management

**Files:**
- Create: `web/src/features/settings/CategoryManager.vue`
- Create: `web/src/features/settings/CategoryManager.test.ts`
- Modify: `web/src/features/settings/SettingsPage.vue`
- Modify: `web/src/features/settings/SettingsPage.test.ts`

**Interfaces:**
- `CategoryManager` loads `GET /api/categories?kind=<kind>&includeArchived=true` for expense and income.
- It calls Task 3 endpoints and emits `changed` after confirmed mutations.
- `SettingsPage` renders the component below member management and invalidates category resources after `changed`.

- [ ] **Step 1: Write failing management tests**

```ts
mockedCachedGet.mockResolvedValueOnce([
  { id: 9, kind: 'expense', name: '餐饮', isArchived: false, isPinned: false },
]);
await clickBtn('管理分类');
await clickBtn('归档', dialogByTitle('编辑分类'));
await clickBtn('归档', dialogByTitle('归档分类「餐饮」？'));
expect(mockedApiPost).toHaveBeenCalledWith('/api/categories/9/archive');
```

Add cases for rename, pin toggle, restore, unused delete, and used-delete feedback. Assert the default category does not render a destructive action.

- [ ] **Step 2: Run settings tests to verify failure**

Run: `npm test -- web/src/features/settings/CategoryManager.test.ts web/src/features/settings/SettingsPage.test.ts`

Expected: FAIL because no category management UI exists.

- [ ] **Step 3: Implement management sheets and confirmations**

```ts
async function archiveCategory(category: Category) {
  pendingAction.value = { kind: 'archive', category };
}
async function confirmPendingAction() {
  if (pendingAction.value?.kind === 'archive') {
    await apiPost(`/api/categories/${pendingAction.value.category.id}/archive`);
  }
  await loadCategories(true);
  emit('changed');
}
```

Use existing `AppSheet`, `ConfirmDialog`, `AsyncState`, `ChevronRight`, and button styles. Preserve form input and list state on failed requests; show the service message. Put active/archived views inside each expense/income section, and label pinned and archived state plainly.

- [ ] **Step 4: Run management tests and typecheck**

Run: `npm test -- web/src/features/settings/CategoryManager.test.ts web/src/features/settings/SettingsPage.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit settings management**

```bash
git add web/src/features/settings/CategoryManager.vue web/src/features/settings/CategoryManager.test.ts web/src/features/settings/SettingsPage.vue web/src/features/settings/SettingsPage.test.ts
git commit -m "feat: manage household categories in settings"
```

### Task 6: Verify Full Category Behavior

**Files:**
- Modify only test files if verification exposes a missing specified case.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: evidence that historical category labels remain intact and new entries cannot select archived categories.

- [ ] **Step 1: Run complete automated verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 2: Manually verify mobile flows at 390px width**

Run: `npm run dev`

Expected: creating a transaction shows six common slots plus All/New without form growth; All search selects an active category; category management archives/restores correctly; editing a historical entry displays its archived category.

- [ ] **Step 3: Commit any test-only corrections**

```bash
git add server web
git commit -m "test: cover category management edge cases"
```
