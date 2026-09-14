<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import SectionBlock from '../../components/SectionBlock.vue';
import EmptyState from '../../components/EmptyState.vue';
import ConfirmDialog from '../../components/ConfirmDialog.vue';
import { cachedGet, apiPut, apiPost, apiPatch, apiDelete } from '../../lib/api';
import { revision } from '../../lib/revision';

interface Family {
  id: number;
  name: string;
}

interface Member {
  id: number;
  name: string;
  color: string | null;
}

const family = ref<Family | null>(null);
const name = ref('');
const members = ref<Member[]>([]);
const newName = ref('');
const newColor = ref('');
const pendingDelete = ref<Member | null>(null);
const error = ref<string | null>(null);
const saved = ref(false);
const loading = ref(true);

const editingId = ref<number | null>(null);
const editName = ref('');

const hasMembers = computed(() => members.value.length > 0);

let savedTimer: ReturnType<typeof setTimeout> | null = null;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [f, m] = await Promise.all([
      cachedGet<Family>('/api/family'),
      cachedGet<Member[]>('/api/members'),
    ]);
    family.value = f ?? null;
    name.value = f?.name ?? '';
    members.value = Array.isArray(m) ? m : [];
  } catch (e) {
    // 加载失败降级，绝不让页面崩溃
    family.value = null;
    members.value = [];
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
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
  const trimmed = name.value.trim();
  if (!trimmed) return;
  error.value = null;
  try {
    const updated = await apiPut<Family>('/api/family', { name: trimmed });
    family.value = updated;
    name.value = updated.name;
    flashSaved();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  }
}

async function addMember() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;
  error.value = null;
  try {
    await apiPost<Member>('/api/members', {
      name: trimmed,
      color: newColor.value ? newColor.value : null,
    });
    newName.value = '';
    newColor.value = '';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加失败';
  }
}

function startEdit(m: Member) {
  editingId.value = m.id;
  editName.value = m.name;
}

function cancelEdit() {
  editingId.value = null;
  editName.value = '';
}

async function saveEdit(m: Member) {
  const trimmed = editName.value.trim();
  if (!trimmed) return;
  error.value = null;
  try {
    await apiPatch<Member>(`/api/members/${m.id}`, { name: trimmed });
    editingId.value = null;
    editName.value = '';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '修改失败';
  }
}

async function confirmDelete() {
  const target = pendingDelete.value;
  if (!target) return;
  error.value = null;
  try {
    await apiDelete(`/api/members/${target.id}`);
    pendingDelete.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败';
    pendingDelete.value = null;
  }
}

// 成员/家庭名被别处改动后同步刷新
watch(revision, () => void load());

onMounted(() => void load());
</script>

<template>
  <div class="settings">
    <SectionBlock title="家庭名称">
      <div v-if="error" class="form-error">{{ error }}</div>

      <form class="inline-form" @submit.prevent="saveFamily">
        <label class="field field--inline">
          <span class="field__label">家庭名称</span>
          <input
            v-model="name"
            class="field__control"
            aria-label="家庭名称"
            placeholder="我的家"
          />
        </label>
        <button type="submit" class="btn btn--primary">保存</button>
      </form>
      <p v-if="saved" class="hint-text">已保存</p>
    </SectionBlock>

    <SectionBlock title="家庭成员">
      <template #aside>
        <span class="muted">删除后转为「家庭共有」</span>
      </template>

      <div v-if="!hasMembers && !loading" class="card card--flush">
        <EmptyState
          title="还没有成员"
          hint="添加家庭成员后，账目、资产、负债就可以归属到个人。"
          mark="○"
        />
      </div>

      <ul v-else class="card card--flush member-list">
        <li v-for="m in members" :key="m.id" class="member">
          <span
            class="member__dot"
            :style="{ background: m.color ?? 'var(--ink-3)' }"
            aria-hidden="true"
          />
          <template v-if="editingId !== m.id">
            <span class="member__name">{{ m.name }}</span>
            <span class="member__actions">
              <button type="button" class="btn btn--ghost btn--sm" @click="startEdit(m)">改名</button>
              <button
                type="button"
                class="btn btn--ghost btn--sm btn--danger"
                :aria-label="`删除成员 ${m.name}`"
                @click="pendingDelete = m"
              >
                删除
              </button>
            </span>
          </template>
          <template v-else>
            <input
              v-model="editName"
              class="field__control member__input"
              :aria-label="`成员 ${m.name} 名称`"
            />
            <span class="member__actions">
              <button type="button" class="btn btn--ghost btn--sm" @click="cancelEdit">取消</button>
              <button type="button" class="btn btn--sm btn--primary" @click="saveEdit(m)">保存</button>
            </span>
          </template>
        </li>
      </ul>

      <form class="inline-form inline-form--add" @submit.prevent="addMember">
        <label class="field field--inline">
          <span class="field__label">成员姓名</span>
          <input
            v-model="newName"
            class="field__control"
            aria-label="成员姓名"
            placeholder="成员姓名"
          />
        </label>
        <label class="field field--color">
          <span class="field__label">颜色（可选）</span>
          <input v-model="newColor" type="color" class="field__control field__control--color" aria-label="成员颜色" />
        </label>
        <button type="submit" class="btn">添加成员</button>
      </form>

      <p class="hint-text">
        删除成员后，其名下的账目、资产、负债会自动转为「家庭共有」，不会被一并删除。
      </p>
    </SectionBlock>

    <ConfirmDialog
      v-if="pendingDelete"
      :title="`删除成员「${pendingDelete.name}」？`"
      description="删除后其名下账目、资产、负债会转为家庭共有。"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    />
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
}

.muted {
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.inline-form {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.inline-form--add {
  margin-top: var(--sp-3);
}

.field--inline {
  flex: 1;
  min-width: 160px;
  margin-bottom: 0;
}

.field--color {
  margin-bottom: 0;
  width: 120px;
}

.field__control--color {
  padding: 2px;
  height: 42px;
}

.hint-text {
  margin: var(--sp-3) 0 0;
  font-size: var(--text-sm);
  color: var(--ink-3);
  line-height: 1.7;
}

.member-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 10px var(--sp-4);
  border-bottom: 1px solid var(--rule-soft);
}

.member:last-child {
  border-bottom: none;
}

.member__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  box-shadow: inset 0 0 0 1px oklch(100% 0 0 / 0.25);
}

.member__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-base);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member__input {
  flex: 1;
  min-width: 120px;
}

.member__actions {
  display: flex;
  gap: 2px;
  flex: none;
}
</style>
