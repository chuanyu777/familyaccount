<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { parseYuanToCents, centsToInput } from './util';
import type { Account, Member } from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Account;
  members: Member[];
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const name = ref(props.initial?.name ?? '');
const balance = ref(props.initial ? centsToInput(props.initial.balance_cents) : '0');
const memberId = ref<number | ''>(props.initial?.member_id ?? '');
const error = ref<string | null>(null);
const saving = ref(false);

const title = computed(() => (props.mode === 'edit' ? '编辑账户' : '新增账户'));

async function save() {
  error.value = null;
  if (!name.value.trim()) {
    error.value = '请输入账户名称';
    return;
  }
  saving.value = true;
  try {
    if (props.mode === 'create' || !props.initial) {
      const body: { name: string; memberId?: number } = { name: name.value.trim() };
      if (memberId.value !== '') body.memberId = memberId.value;
      await apiPost('/api/accounts', body);
    } else {
      const acc = props.initial;
      const nameChanged = name.value.trim() !== acc.name;
      const balCents = parseYuanToCents(balance.value) ?? acc.balance_cents;
      const balChanged = balCents !== acc.balance_cents;
      if (nameChanged) await apiPatch(`/api/accounts/${acc.id}`, { name: name.value.trim() });
      if (balChanged) await apiPatch(`/api/accounts/${acc.id}/calibrate`, { balance: balCents / 100 });
    }
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="title" @close="emit('close')">
    <label class="field">
      <span class="field__label">账户名称</span>
      <input v-model="name" class="field__control" type="text" aria-label="账户名称" />
    </label>

    <label v-if="mode === 'edit'" class="field">
      <span class="field__label">余额</span>
      <input v-model="balance" class="field__control" type="text" inputmode="decimal" aria-label="余额" />
    </label>

    <label class="field">
      <span class="field__label">归属成员</span>
      <select v-model="memberId" class="field__control" aria-label="归属成员">
        <option value="">家庭共有</option>
        <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </label>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    </div>
  </AppSheet>
</template>

<style scoped>
.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}
</style>
