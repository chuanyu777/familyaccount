<script setup lang="ts">
import { computed, ref } from 'vue';
import AppSheet from '../../components/AppSheet.vue';
import { apiPost } from '../../lib/api';
import { currentMonth, monthLabel } from '../../lib/format';
import { parseYuanToCents, centsToInput } from './util';
import type { Asset } from './types';

// 定期更新市值：每次更新都记在「某月底」名下，历史不会被覆盖掉。
// 选当前月 = 更新当前市值；选历史月份 = 只补录那个月的账。

const props = defineProps<{ asset: Asset }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const thisMonth = currentMonth();
const month = ref(thisMonth);
const value = ref(centsToInput(props.asset.value_cents));
const note = ref('');
const error = ref<string | null>(null);
const saving = ref(false);

const isBackfill = computed(() => month.value !== thisMonth);

async function save() {
  error.value = null;
  const cents = parseYuanToCents(value.value);
  if (cents == null) {
    error.value = '请输入市值';
    return;
  }
  if (cents < 0) {
    error.value = '市值不能为负';
    return;
  }
  if (!/^\d{4}-\d{2}$/.test(month.value)) {
    error.value = '请选择月份';
    return;
  }

  saving.value = true;
  try {
    await apiPost(`/api/assets/${props.asset.id}/snapshots`, {
      month: month.value,
      value: cents / 100,
      note: note.value.trim() || null,
    });
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
    saving.value = false;
  }
}
</script>

<template>
  <AppSheet :title="`更新市值 · ${asset.name}`" @close="emit('close')">
    <label class="field">
      <span class="field__label">记账月份</span>
      <input
        v-model="month"
        class="field__control"
        type="month"
        :max="thisMonth"
        aria-label="记账月份"
      />
    </label>

    <p class="hint">
      <template v-if="isBackfill">
        补录 {{ monthLabel(month) }} 的市值，只写历史，不改当前市值。
      </template>
      <template v-else> 记在 {{ monthLabel(month) }}，同时刷新当前市值。 </template>
    </p>

    <label class="field">
      <span class="field__label">{{ monthLabel(month) }}末市值</span>
      <input
        v-model="value"
        class="field__control"
        type="text"
        inputmode="decimal"
        aria-label="市值"
      />
    </label>

    <label class="field">
      <span class="field__label">备注（可选）</span>
      <input v-model="note" class="field__control" type="text" aria-label="备注" placeholder="如 年末对账" />
    </label>

    <p v-if="error" class="form-error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" :disabled="saving" @click="save">保存</button>
    </div>
  </AppSheet>
</template>

<style scoped>
.hint {
  margin: 0 0 var(--sp-4);
  font-size: var(--text-xs);
  color: var(--ink-3);
  line-height: 1.7;
}

.actions {
  display: flex;
  gap: var(--sp-2);
  justify-content: flex-end;
  margin-top: var(--sp-5);
}
</style>
