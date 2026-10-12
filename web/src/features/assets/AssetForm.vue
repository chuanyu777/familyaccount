<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPatch, apiPost } from '../../lib/api';
import { ASSET_KIND_OPTIONS, parseYuanToCents, centsToInput } from './util';
import type { Asset } from './types';

const props = defineProps<{
  mode: 'create' | 'edit';
  initial?: Asset;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const name = ref(props.initial?.name ?? '');
const value = ref(props.initial ? centsToInput(props.initial.valueCents ?? props.initial.value_cents ?? 0) : '');
const kind = ref(props.initial?.kind ?? '');
/** 下拉选项：标准项 + 存量历史值（不清理数据，编辑时原样保留为一项）。 */
const kindOptions = computed(() => {
  const current = (props.initial?.kind ?? '').trim();
  const options = [...ASSET_KIND_OPTIONS];
  if (current && !options.includes(current)) options.push(`${current}（原值）`);
  return options;
});
/** v-model 用：存量原值项在 select 里对应原文本。 */
function kindValue(option: string): string {
  return option.endsWith('（原值）') ? option.slice(0, -4) : option;
}
const error = ref<string | null>(null);
const saving = ref(false);

const title = computed(() => (props.mode === 'edit' ? '编辑资产' : '新增资产'));

function requestClose() {
  if (!saving.value) emit('close');
}

async function save() {
  if (saving.value) return;
  error.value = null;
  if (!name.value.trim()) {
    error.value = '请输入资产名称';
    return;
  }
  const vCents = parseYuanToCents(value.value);
  if (vCents == null) {
    error.value = '请输入市值';
    return;
  }
  if (vCents < 0) {
    error.value = '市值不能为负';
    return;
  }
  const body: { name: string; value: number; kind?: string } = {
    name: name.value.trim(),
    value: vCents / 100,
  };
  if (kind.value.trim()) body.kind = kind.value.trim();

  saving.value = true;
  try {
    if (props.mode === 'create' || !props.initial) {
      await apiPost('/api/assets', body);
    } else {
      await apiPatch(`/api/assets/${props.initial.id}`, body);
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
      <span class="field__label">资产名称</span>
      <input v-model="name" class="field__control" type="text" aria-label="资产名称" />
    </label>

    <label class="field">
      <span class="field__label">市值</span>
      <input v-model="value" class="field__control" type="text" inputmode="decimal" aria-label="市值" />
    </label>

    <label class="field">
      <span class="field__label">类型（可选）</span>
      <select class="field__control" aria-label="类型" :value="kind" @change="kind = ($event.target as HTMLSelectElement).value">
        <option value="">不选</option>
        <option v-for="option in kindOptions" :key="option" :value="kindValue(option)">{{ option }}</option>
      </select>
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
