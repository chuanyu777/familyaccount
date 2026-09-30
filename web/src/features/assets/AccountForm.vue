<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { centsToInput } from './util';
import type { Account } from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Account;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const name = ref(props.initial?.name ?? '');
const error = ref<string | null>(null);
const saving = ref(false);

const title = computed(() => (props.mode === 'edit' ? '编辑账户' : '新增账户'));

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
  saving.value = true;
  try {
    if (props.mode === 'create' || !props.initial) {
      await apiPost('/api/accounts', { name: name.value.trim() });
    } else {
      const acc = props.initial;
      const nameChanged = name.value.trim() !== acc.name;
      if (nameChanged) await apiPatch(`/api/accounts/${acc.id}`, { name: name.value.trim() });
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
