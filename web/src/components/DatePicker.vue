<script setup lang="ts">
/**
 * 日期选择器（自绘日历弹层，与 MonthPicker 同一设计语言）。
 * 替代原生 <input type="date">——浏览器默认样式与整体设计不匹配。
 * 根元素是无边框透明按钮，由父级容器（.attr / .field）提供边框与布局。
 */
import { computed, ref, watch } from 'vue';
import AppSheet from './AppSheet.vue';
import { shiftMonth, todayISO } from '../lib/format';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const open = ref(false);
const today = todayISO();

const cursor = ref(props.modelValue ? props.modelValue.slice(0, 7) : today.slice(0, 7));
watch(
  () => [open.value, props.modelValue] as const,
  ([isOpen]) => {
    if (isOpen) cursor.value = (props.modelValue || today).slice(0, 7);
  }
);

const year = computed(() => Number(cursor.value.slice(0, 4)));
const month = computed(() => Number(cursor.value.slice(5, 7)));
const cursorLabel = computed(() => `${year.value} 年 ${month.value} 月`);

/** 前导空白（本月 1 号是星期几） */
const lead = computed(() => new Date(year.value, month.value - 1, 1).getDay());
const daysInMonth = computed(() => new Date(year.value, month.value, 0).getDate());

interface Cell {
  date: string;
  day: number;
  inMonth: boolean;
}

const cells = computed<Cell[]>(() => {
  const out: Cell[] = [];
  for (let i = 0; i < lead.value; i += 1) out.push({ date: '', day: 0, inMonth: false });
  for (let d = 1; d <= daysInMonth.value; d += 1) {
    out.push({ date: `${cursor.value}-${String(d).padStart(2, '0')}`, day: d, inMonth: true });
  }
  return out;
});

function stepMonth(delta: number) {
  cursor.value = shiftMonth(cursor.value, delta);
}

function isActive(date: string): boolean {
  return date === props.modelValue;
}

function commit(date: string) {
  open.value = false;
  if (date !== props.modelValue) emit('update:modelValue', date);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<template>
  <button type="button" class="datepicker-control" aria-label="选择日期" @click="open = true">
    <span class="datepicker-control__value">{{ modelValue || '选择日期' }}</span>
    <svg
      class="datepicker-control__icon"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  </button>

  <AppSheet v-if="open" title="选择日期" @close="open = false">
    <div class="dpcal">
      <div class="dpcal__head">
        <button type="button" class="dpcal__nav" aria-label="上一月" @click="stepMonth(-1)">‹</button>
        <span class="dpcal__head-label">{{ cursorLabel }}</span>
        <button type="button" class="dpcal__nav" aria-label="下一月" @click="stepMonth(1)">›</button>
      </div>

      <div class="dpcal__grid" role="grid" aria-label="日历">
        <span v-for="w in WEEKDAYS" :key="w" class="dpcal__weekday">{{ w }}</span>
        <template v-for="(cell, index) in cells" :key="`${cell.date}-${index}`">
          <span v-if="!cell.inMonth" class="dpcal__cell dpcal__cell--empty" />
          <button
            v-else
            type="button"
            class="dpcal__cell"
            :class="{
              'is-active': isActive(cell.date),
              'is-now': cell.date === today && !isActive(cell.date),
            }"
            @click="commit(cell.date)"
          >
            {{ cell.day }}
          </button>
        </template>
      </div>

      <div class="dpcal__quick">
        <button type="button" class="btn btn--ghost btn--sm" @click="commit(today)">今天</button>
        <button type="button" class="btn btn--ghost btn--sm" @click="commit(yesterdayISO())">
          昨天
        </button>
      </div>
    </div>
  </AppSheet>
</template>

<style scoped>
.datepicker-control {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  text-align: left;
}

.datepicker-control:focus {
  outline: none;
}

.datepicker-control__icon {
  flex-shrink: 0;
  color: var(--muted);
}

.dpcal {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.dpcal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.dpcal__head-label {
  font-family: var(--font-serif);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: 0.06em;
}

.dpcal__nav {
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

.dpcal__nav:hover {
  border-color: var(--action);
  color: var(--action);
}

.dpcal__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.dpcal__weekday {
  text-align: center;
  color: var(--muted);
  font-size: var(--text-xs);
  padding: 4px 0;
}

.dpcal__cell {
  min-height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.dpcal__cell:hover:not(:disabled) {
  background: var(--surface-accent);
}

.dpcal__cell--empty {
  pointer-events: none;
}

.dpcal__cell.is-now {
  border-color: var(--primary);
  color: var(--primary);
}

.dpcal__cell.is-active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  font-weight: 600;
}

.dpcal__quick {
  display: flex;
  gap: var(--sp-2);
}
</style>