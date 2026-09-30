<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PageHeader from '../../components/PageHeader.vue';
import { apiDelete, apiPatch, apiPost, cachedGet } from '../../lib/api';
import { resourceVersion } from '../../lib/resourceInvalidation';
import type { LedgerPermissions, LedgerSession, LedgerSummary } from '../../auth/types';

interface Membership { id: number; ledgerId: number; userId: number; role: string; active: boolean; displayName: string; }
interface Category { id: number; kind: 'expense' | 'income'; name: string; archived?: number | boolean; }

const props = withDefaults(defineProps<{ session?: LedgerSession; permissions?: LedgerPermissions }>(), {
  session: () => ({ type: 'LEDGER_USER', userId: 0 }),
  permissions: () => ({ isOwner: true, canManageMembers: true, canRenameLedger: true, canArchiveResources: true }),
});
const ledger = ref<LedgerSummary | null>(null);
const ledgerName = ref('');
const members = ref<Membership[]>([]);
const categories = ref<Category[]>([]);
const inviteToken = ref('');
const newCategory = ref('');
const loading = ref(true);
const error = ref<string | null>(null);
const mutationError = ref<string | null>(null);
const saving = ref(false);
const activeCategories = computed(() => categories.value.filter((category) => !category.archived));
const archivedCategories = computed(() => categories.value.filter((category) => category.archived));

function messageOf(cause: unknown, fallback: string): string { return cause instanceof Error ? cause.message : fallback; }

async function load() {
  loading.value = true; error.value = null;
  try {
    const [ledgers, expense, income] = await Promise.all([
      cachedGet<LedgerSummary[]>('/api/ledgers', undefined, { force: false }),
      cachedGet<Category[]>('/api/categories', { kind: 'expense' }, { force: false }),
      cachedGet<Category[]>('/api/categories', { kind: 'income' }, { force: false }),
    ]);
    ledger.value = ledgers?.[0] ?? null;
    ledgerName.value = ledger.value?.name ?? '';
    categories.value = [...(expense ?? []), ...(income ?? [])];
    if (ledger.value) members.value = await cachedGet<Membership[]>(`/api/ledgers/${ledger.value.id}/members`, undefined, { force: false });
  } catch (cause) { error.value = messageOf(cause, '账本信息加载失败'); }
  finally { loading.value = false; }
}

async function saveLedger() {
  const name = ledgerName.value.trim();
  if (!ledger.value || !name || saving.value || !props.permissions.canRenameLedger) return;
  saving.value = true; mutationError.value = null;
  try { ledger.value = await apiPatch<LedgerSummary>(`/api/ledgers/${ledger.value.id}`, { name }); ledgerName.value = ledger.value.name; }
  catch (cause) { mutationError.value = messageOf(cause, '保存失败'); }
  finally { saving.value = false; }
}

async function createInvitation() {
  if (!ledger.value || !props.permissions.canManageMembers) return;
  mutationError.value = null;
  try { inviteToken.value = (await apiPost<{ token: string }>(`/api/ledgers/${ledger.value.id}/invitations`, {})).token; }
  catch (cause) { mutationError.value = messageOf(cause, '邀请创建失败'); }
}

async function removeMember(member: Membership) {
  if (!props.permissions.canManageMembers || member.role === 'OWNER') return;
  mutationError.value = null;
  try { await apiDelete(`/api/memberships/${member.id}`); members.value = members.value.filter((item) => item.id !== member.id); }
  catch (cause) { mutationError.value = messageOf(cause, '成员移除失败'); }
}

async function addCategory(kind: Category['kind']) {
  const name = newCategory.value.trim(); if (!name) return;
  mutationError.value = null;
  try { categories.value = [...categories.value, await apiPost<Category>('/api/categories', { kind, name })]; newCategory.value = ''; }
  catch (cause) { mutationError.value = messageOf(cause, '分类创建失败'); }
}

async function setCategoryArchived(category: Category, archived: boolean) {
  if (!props.permissions.canArchiveResources) return;
  mutationError.value = null;
  try { await apiPost(`/api/categories/${category.id}/${archived ? 'archive' : 'restore'}`, {}); category.archived = archived; }
  catch (cause) { mutationError.value = messageOf(cause, '分类状态更新失败'); }
}

watch(resourceVersion(['ledgers', 'members', 'categories']), () => void load());
onMounted(() => void load());
</script>

<template>
  <div class="settings">
    <PageHeader title="设置" context="账本与成员" />
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="mutationError" class="form-error" role="alert">{{ mutationError }}</p>
    <section class="settings-group" aria-labelledby="ledger-heading">
      <div class="settings-group__head"><h2 id="ledger-heading">账本</h2></div>
      <form class="family-form" @submit.prevent="saveLedger">
        <label class="field family-form__field"><span class="field__label">账本名称</span><input v-model="ledgerName" class="field__control" aria-label="账本名称" :disabled="!props.permissions.canRenameLedger || loading" /></label>
        <button type="submit" class="btn btn--primary" :disabled="saving || !props.permissions.canRenameLedger">{{ saving ? '保存中…' : '保存' }}</button>
      </form>
    </section>
    <section class="settings-group" aria-labelledby="members-heading">
      <div class="settings-group__head"><h2 id="members-heading">账本成员</h2><button v-if="props.permissions.canManageMembers" type="button" class="btn btn--sm" @click="createInvitation">生成邀请</button></div>
      <p v-if="inviteToken" class="settings-note" role="status">邀请令牌：{{ inviteToken }}</p>
      <ul class="settings-list"><li v-for="member in members" :key="member.id" class="settings-row" :data-member-row="member.id"><span class="settings-row__name">{{ member.displayName }}</span><span class="settings-row__meta">{{ member.role === 'OWNER' ? '所有者' : '成员' }}</span><button v-if="props.permissions.canManageMembers && member.role !== 'OWNER'" type="button" class="btn btn--ghost btn--sm" @click="removeMember(member)">移除</button></li></ul>
    </section>
    <section class="settings-group" aria-labelledby="categories-heading">
      <div class="settings-group__head"><h2 id="categories-heading">分类</h2></div>
      <form class="family-form" @submit.prevent="addCategory('expense')"><label class="field family-form__field"><span class="field__label">新分类</span><input v-model="newCategory" class="field__control" aria-label="新分类名称" /></label><button type="submit" class="btn btn--primary">添加支出分类</button></form>
      <ul class="settings-list"><li v-for="category in activeCategories" :key="category.id" class="settings-row"><span class="settings-row__name">{{ category.name }}</span><span class="settings-row__meta">{{ category.kind === 'expense' ? '支出' : '收入' }}</span><button v-if="props.permissions.canArchiveResources" type="button" class="btn btn--ghost btn--sm" @click="setCategoryArchived(category, true)">归档</button></li><li v-for="category in archivedCategories" :key="`archived-${category.id}`" class="settings-row"><span class="settings-row__name">{{ category.name }}</span><span class="settings-row__meta">已归档</span><button v-if="props.permissions.canArchiveResources" type="button" class="btn btn--ghost btn--sm" @click="setCategoryArchived(category, false)">恢复</button></li></ul>
    </section>
  </div>
</template>

<style scoped>
.settings { display: flex; flex-direction: column; gap: var(--sp-4); }
.settings-group { padding: var(--sp-4) 0; border-bottom: 1px solid var(--line); }
.settings-group__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.settings-group h2 { margin: 0; font-size: var(--text-base); }
.family-form { display: flex; align-items: end; gap: var(--sp-3); }
.family-form__field { flex: 1; }
.settings-list { list-style: none; margin: 0; padding: 0; }
.settings-row { display: flex; align-items: center; gap: var(--sp-3); min-height: 48px; border-top: 1px solid var(--line); }
.settings-row__name { flex: 1; color: var(--ink); }
.settings-row__meta { color: var(--muted); font-size: var(--text-xs); }
.settings-note { color: var(--muted); font-size: var(--text-sm); }
@media (max-width: 520px) { .family-form { align-items: stretch; flex-direction: column; } }
</style>
