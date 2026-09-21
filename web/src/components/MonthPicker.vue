<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppSheet from './AppSheet.vue';
import { currentMonth, monthLabel, shiftMonth } from '../lib/format';

// 月份快选：左右箭头一步一步挪，点中间的标题直接弹出年/月宫格。
// 未来月份没有意义，默认不允许选到当前月之后。

const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** 可选的最大月份，默认当前月 */
    max?: string;
  }>(),
  { max: undefined }
);

const emit = defineEmits<{ 'update:modelValue': [string] }>();

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const open = ref(false);
const maxMonth = computed(() => props.max ?? currentMonth());
const cursorYear = ref(Number(props.modelValue.split('-')[0]));

watch(
  () => props.modelValue,
  (v) => {
    cursorYear.value = Number(v.split('-')[0]);
  }
);

const canNext = computed(() => props.modelValue < maxMonth.value);
const thisMonth = currentMonth();

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthOf(m: number): string {
  return `${cursorYear.value}-${pad2(m)}`;
}

function disabled(m: number): boolean {
  return monthOf(m) > maxMonth.value;
}

function isActive(m: number): boolean {
  return monthOf(m) === props.modelValue;
}

function isNow(m: number): boolean {
  return monthOf(m) === thisMonth;
}

function commit(month: string) {
  if (month > maxMonth.value) return;
  open.value = false;
  if (month !== props.modelValue) emit('update:modelValue', month);
}

function step(delta: number) {
  const next = shiftMonth(props.modelValue, delta);
  if (next > maxMonth.value) return;
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="monthbar">
    <button type="button" class="monthbar__nav" aria-label="上一月" @click="step(-1)">‹</button>

    <button type="button" class="monthbar__label" aria-label="选择月份" @click="open = true">
      {{ monthLabel(modelValue) }}
      <span class="monthbar__caret" aria-hidden="true">▾</span>
    </button>

    <button
      type="button"
      class="monthbar__nav"
      aria-label="下一月"
      :disabled="!canNext"
      @click="step(1)"
    >
      ›
    </button>

    <AppSheet v-if="open" title="选择月份" @close="open = false">
      <div class="picker">
        <div class="picker__year">
          <button type="button" class="picker__nav" aria-label="上一年" @click="cursorYear -= 1">
            ‹
          </button>
          <span class="picker__year-label">{{ cursorYear }} 年</span>
          <button type="button" class="picker__nav" aria-label="下一年" @click="cursorYear += 1">
            ›
          </button>
        </div>

        <div class="picker__grid">
          <button
            v-for="m in MONTHS"
            :key="m"
            type="button"
            class="picker__cell"
            :class="{
              'is-active': isActive(m),
              'is-now': isNow(m) && !isActive(m),
            }"
            :disabled="disabled(m)"
            @click="commit(monthOf(m))"
          >
            {{ m }} 月
          </button>
        </div>

        <div class="picker__quick">
          <button type="button" class="btn btn--ghost btn--sm" @click="commit(thisMonth)">
            本月
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            @click="commit(shiftMonth(thisMonth, -1))"
          >
            上月
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--sm"
            @click="commit(`${cursorYear}-12`)"
          >
            {{ cursorYear }} 年 12 月
          </button>
        </div>
      </div>
    </AppSheet>
  </div>
</template>

<style scoped>
.monthbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

/* 月份胶囊：右对齐在页面顶栏位置 */
.monthbar__label {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-height: 44px;
  padding: 7px var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface-accent);
  font-family: var(--font-serif);
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--action);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.monthbar__label:hover {
  border-color: var(--action);
}

.monthbar__caret {
  font-size: var(--text-xs);
  color: var(--action);
}

.monthbar__nav {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  font-size: 1.125rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.monthbar__nav:hover:not(:disabled) {
  border-color: var(--action);
  color: var(--action);
}

.monthbar__nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.picker__year {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.picker__year-label {
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: 0.06em;
}

.picker__nav {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.picker__nav:hover {
  border-color: var(--action);
  color: var(--action);
}

.picker__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-2);
}

.picker__cell {
  height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  font-size: var(--text-base);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.picker__cell:hover:not(:disabled) {
  border-color: var(--action);
  color: var(--action);
}

.picker__cell:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.picker__cell.is-now {
  border-color: var(--action);
}

.picker__cell.is-active {
  background: var(--action);
  border-color: var(--action);
  color: var(--surface);
  font-weight: 600;
}

.picker__quick {
  display: flex;
  gap: var(--sp-2);
}
</style>
