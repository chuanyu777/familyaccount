<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronRight } from 'lucide-vue-next';
import AppSheet from '../../components/AppSheet.vue';
import AsyncState from '../../components/AsyncState.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import PageHeader from '../../components/PageHeader.vue';
import { apiDelete, apiPatch, apiPost, apiPut, cachedGet } from '../../lib/api';
import { resourceVersion } from '../../lib/resourceInvalidation';

interface Family {
  id: number;
  name: string;
}

interface Member {
  id: number;
  name: string;
  color: string | null;
}

const FAMILY_OWNERSHIP_EXPLANATION =
  '删除成员后，其名下的账目、资产、负债会自动转为「家庭共有」，不会被一并删除。';

const family = ref<Family | null>(null);
const familyName = ref('');
const familyLoading = ref(true);
const familyError = ref<string | null>(null);
const familyMutationError = ref<string | null>(null);
const familySavePending = ref(false);
const saved = ref(false);

const members = ref<Member[]>([]);
const membersLoading = ref(true);
const membersError = ref<string | null>(null);
const memberSheetMode = ref<'create' | 'edit' | null>(null);
const editingMember = ref<Member | null>(null);
const memberName = ref('');
const memberColor = ref('');
const memberMutationError = ref<string | null>(null);
const memberSavePending = ref(false);

const pendingDelete = ref<Member | null>(null);
const deletePending = ref(false);
const deleteError = ref<string | null>(null);

const memberSheetTitle = computed(() =>
  memberSheetMode.value === 'edit' ? '编辑成员' : '添加成员',
);

let savedTimer: ReturnType<typeof setTimeout> | null = null;

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

async function loadFamily(force = false) {
  familyLoading.value = true;
  familyError.value = null;
  try {
    const loaded = await cachedGet<Family>(
      '/api/family',
      undefined,
      force ? { force: true } : undefined,
    );
    family.value = loaded ?? null;
    familyName.value = loaded?.name ?? '';
  } catch (cause) {
    familyError.value = errorMessage(cause, '家庭信息加载失败');
  } finally {
    familyLoading.value = false;
  }
}

async function loadMembers(force = false) {
  membersLoading.value = true;
  membersError.value = null;
  try {
    const loaded = await cachedGet<Member[]>(
      '/api/members',
      undefined,
      force ? { force: true } : undefined,
    );
    members.value = Array.isArray(loaded) ? loaded : [];
  } catch (cause) {
    membersError.value = errorMessage(cause, '家庭成员加载失败');
  } finally {
    membersLoading.value = false;
  }
}

function flashSaved() {
  saved.value = true;
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    saved.value = false;
  }, 2000);
}

async function saveFamily() {
  const name = familyName.value.trim();
  if (!name || familySavePending.value) return;

  familyMutationError.value = null;
  familySavePending.value = true;
  try {
    const updated = await apiPut<Family>('/api/family', { name });
    family.value = updated;
    familyName.value = updated.name;
    flashSaved();
  } catch (cause) {
    familyMutationError.value = errorMessage(cause, '保存失败');
  } finally {
    familySavePending.value = false;
  }
}

function openCreateMember() {
  editingMember.value = null;
  memberName.value = '';
  memberColor.value = '';
  memberMutationError.value = null;
  memberSheetMode.value = 'create';
}

function openEditMember(member: Member) {
  editingMember.value = member;
  memberName.value = member.name;
  memberColor.value = member.color ?? '';
  memberMutationError.value = null;
  memberSheetMode.value = 'edit';
}

function closeMemberSheet() {
  if (memberSavePending.value || deletePending.value) return;
  memberSheetMode.value = null;
  editingMember.value = null;
  memberName.value = '';
  memberColor.value = '';
  memberMutationError.value = null;
}

async function saveMember() {
  const name = memberName.value.trim();
  if (!name || memberSavePending.value) return;

  memberMutationError.value = null;
  memberSavePending.value = true;
  try {
    if (memberSheetMode.value === 'create') {
      await apiPost<Member>('/api/members', {
        name,
        color: memberColor.value || null,
      });
    } else if (editingMember.value) {
      await apiPatch<Member>(`/api/members/${editingMember.value.id}`, { name });
    } else {
      return;
    }
  } catch (cause) {
    memberMutationError.value = errorMessage(
      cause,
      memberSheetMode.value === 'create' ? '添加失败' : '修改失败',
    );
  } finally {
    memberSavePending.value = false;
    if (!memberMutationError.value) closeMemberSheet();
  }
}

function askDeleteMember() {
  if (!editingMember.value) return;
  deleteError.value = null;
  pendingDelete.value = editingMember.value;
}

function cancelDelete() {
  if (deletePending.value) return;
  pendingDelete.value = null;
  deleteError.value = null;
}

async function confirmDelete() {
  const target = pendingDelete.value;
  if (!target || deletePending.value) return;

  deleteError.value = null;
  deletePending.value = true;
  try {
    await apiDelete(`/api/members/${target.id}`);
    pendingDelete.value = null;
    memberSheetMode.value = null;
    editingMember.value = null;
  } catch (cause) {
    deleteError.value = errorMessage(cause, '删除失败');
  } finally {
    deletePending.value = false;
  }
}

watch(resourceVersion(['family']), () => void loadFamily(true));
watch(resourceVersion(['members']), () => void loadMembers(true));

onMounted(() => {
  void loadFamily();
  void loadMembers();
});
</script>

<template>
  <div class="settings">
    <PageHeader title="设置" context="家庭与成员" />

    <section class="settings-group" aria-labelledby="family-heading">
      <div class="settings-group__head">
        <h2 id="family-heading">家庭名称</h2>
      </div>

      <AsyncState
        :loading="familyLoading"
        :error="familyError ?? ''"
        :empty="family === null"
        empty-title="暂无家庭信息"
        @retry="loadFamily(true)"
      >
        <form class="family-form" @submit.prevent="saveFamily">
          <label class="field family-form__field">
            <span class="field__label">家庭名称</span>
            <input
              v-model="familyName"
              class="field__control"
              aria-label="家庭名称"
              placeholder="我的家"
            />
          </label>
          <button type="submit" class="btn btn--primary" :disabled="familySavePending">
            {{ familySavePending ? '保存中…' : '保存' }}
          </button>
        </form>
        <p v-if="familyMutationError" class="form-error" role="alert">
          {{ familyMutationError }}
        </p>
        <p v-if="saved" class="settings-note" role="status">已保存</p>
      </AsyncState>
    </section>

    <section class="settings-group" aria-labelledby="members-heading">
      <div class="settings-group__head">
        <h2 id="members-heading">家庭成员</h2>
        <button type="button" class="btn btn--ghost" @click="openCreateMember">添加成员</button>
      </div>

      <AsyncState
        :loading="membersLoading"
        :error="membersError ?? ''"
        :empty="members.length === 0"
        empty-title="还没有成员"
        empty-hint="添加家庭成员后，账目、资产、负债就可以归属到个人。"
        @retry="loadMembers(true)"
      >
        <div class="settings-list">
          <button
            v-for="member in members"
            :key="member.id"
            type="button"
            class="settings-row"
            :data-member-row="member.id"
            @click="openEditMember(member)"
          >
            <span
              class="settings-row__dot"
              :style="{ background: member.color ?? 'var(--muted)' }"
              aria-hidden="true"
            />
            <span class="settings-row__name">{{ member.name }}</span>
            <ChevronRight class="settings-row__chevron" :size="18" aria-hidden="true" />
          </button>
        </div>
      </AsyncState>

      <p class="settings-note">{{ FAMILY_OWNERSHIP_EXPLANATION }}</p>
    </section>

    <AppSheet v-if="memberSheetMode" :title="memberSheetTitle" @close="closeMemberSheet">
      <form class="member-form" @submit.prevent="saveMember">
        <p v-if="memberMutationError" class="form-error" role="alert">
          {{ memberMutationError }}
        </p>

        <label class="field">
          <span class="field__label">成员姓名</span>
          <input
            v-model="memberName"
            class="field__control"
            aria-label="成员姓名"
            placeholder="成员姓名"
          />
        </label>

        <label v-if="memberSheetMode === 'create'" class="field member-form__color">
          <span class="field__label">成员颜色（可选）</span>
          <input
            v-model="memberColor"
            type="color"
            class="field__control member-form__color-control"
            aria-label="成员颜色"
          />
        </label>

        <div class="member-form__actions">
          <button
            v-if="memberSheetMode === 'edit'"
            type="button"
            class="btn btn--danger member-form__delete"
            @click="askDeleteMember"
          >
            删除成员
          </button>
          <button type="button" class="btn" :disabled="memberSavePending" @click="closeMemberSheet">
            取消
          </button>
          <button type="submit" class="btn btn--primary" :disabled="memberSavePending">
            {{ memberSavePending ? '保存中…' : memberSheetMode === 'create' ? '添加' : '保存' }}
          </button>
        </div>
      </form>
    </AppSheet>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="`删除成员「${pendingDelete.name}」？`"
      :description="FAMILY_OWNERSHIP_EXPLANATION"
      confirm-text="删除"
      :pending="deletePending"
      :error="deleteError ?? ''"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.settings-group {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.settings-group__head {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-1) var(--sp-4);
  border-bottom: 1px solid var(--line);
}

.settings-group__head h2 {
  font-size: var(--text-base);
  font-weight: 650;
  letter-spacing: 0;
}

.family-form {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-3);
  padding: var(--sp-4);
}

.family-form__field {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.settings-list {
  display: flex;
  flex-direction: column;
}

.settings-row {
  width: 100%;
  min-height: 48px;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) 20px;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-4);
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.settings-row:last-child {
  border-bottom: 0;
}

.settings-row:hover {
  background: var(--bg);
}

.settings-row:active {
  background: var(--surface-accent);
}

.settings-row__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.settings-row__name {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-row__chevron {
  color: var(--muted);
}

.settings-note {
  padding: var(--sp-3) var(--sp-4);
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.form-error + .settings-note {
  padding-top: 0;
}

.member-form__color {
  width: 132px;
}

.member-form__color-control {
  padding: 3px;
}

.member-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  margin-top: var(--sp-5);
}

.member-form__delete {
  margin-right: auto;
}

@media (max-width: 479px) {
  .family-form {
    align-items: stretch;
    flex-direction: column;
  }

  .family-form .btn,
  .member-form__actions .btn:not(.member-form__delete) {
    flex: 1;
  }

  .member-form__actions {
    flex-wrap: wrap;
  }

  .member-form__delete {
    width: 100%;
    margin-right: 0;
  }
}
</style>
