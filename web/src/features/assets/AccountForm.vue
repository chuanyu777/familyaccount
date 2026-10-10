<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { parseYuanToCents, centsToInput } from './util';
import type { Account } from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Account;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const name = ref(props.initial?.name ?? '');
const balance = ref(
  props.mode === 'edit' && props.initial
    ? centsToInput(props.initial.balanceCents ?? props.initial.balance_cents ?? 0)
    : '',
);
const error = ref<string | null>(null);
const saving = ref(false);

const title = computed(() => (props.mode === 'edit' ? '编辑账户' : '新增账户'));
const balanceLabel = computed(() => (props.mode === 'edit' ? '余额' : '初始余额（可选）'));

function requestClose() {
  if (!saving.value) emit('close');
}

async function save() {
  if (saving.value) return;
  error.value = null;
  if (!name.value.trim()) {
    error.value = '请输入账户名称';
    return;
  }
  const isEdit = props.mode === 'edit' && props.initial;
  let balanceCents: number | null = parseYuanToCents(balance.value);
  if (balanceCents == null) {
    if (isEdit) {
      error.value = '请输入余额';
      return;
    }
    balanceCents = 0;
  }
  saving.value = true;
  try {
    if (!isEdit) {
      const body: { name: string; balance?: number } = { name: name.value.trim() };
      if (balanceCents !== 0) body.balance = balanceCents / 100;
      await apiPost('/api/accounts', body);
    } else {
      const acc = props.initial!;
      const nameChanged = name.value.trim() !== acc.name;
      const balanceChanged = balanceCents !== (acc.balanceCents ?? acc.balance_cents ?? 0);
      if (nameChanged) await apiPatch(`/api/accounts/${acc.id}`, { name: name.value.trim() });
      if (balanceChanged) {
        await apiPatch(`/api/accounts/${acc.id}/calibrate`, { balance: balanceCents / 100 });
      }
    }
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="title" @close="requestClose">
    <label class="field">
      <span class="field__label">账户名称</span>
      <input v-model="name" class="field__control" type="text" aria-label="账户名称" />
    </label>

    <label class="field">
      <span class="field__label">{{ balanceLabel }}</span>
      <input
        v-model="balance"
        class="field__control"
        type="text"
        inputmode="decimal"
        aria-label="余额"
        :placeholder="mode === 'edit' ? '' : '不填默认为 0'"
      />
    </label>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="requestClose">取消</button>
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
