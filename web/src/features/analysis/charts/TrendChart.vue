<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '../../../lib/format';

export interface TrendPoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

const props = defineProps<{ data: TrendPoint[] }>();

const W = 360;
const H = 210;
const PAD_X = 12;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;
const plotW = W - PAD_X * 2;
const plotH = H - PAD_TOP - PAD_BOTTOM;
const base = PAD_TOP + plotH;

const max = computed(() =>
  Math.max(1, ...props.data.flatMap((point) => [point.incomeCents, point.expenseCents])),
);
const groupW = computed(() => plotW / Math.max(1, props.data.length));
const barW = computed(() => Math.min(15, Math.max(8, groupW.value * 0.26)));
const scale = (value: number) => (Math.max(0, value) / max.value) * plotH;

const bars = computed(() =>
  props.data.map((point, index) => {
    const groupX = PAD_X + index * groupW.value;
    const pairW = barW.value * 2 + 4;
    const pairX = groupX + (groupW.value - pairW) / 2;
    const incomeHeight = scale(point.incomeCents);
    const expenseHeight = scale(point.expenseCents);
    return {
      month: point.month,
      incomeX: pairX,
      expenseX: pairX + barW.value + 4,
      incomeY: base - incomeHeight,
      expenseY: base - expenseHeight,
      incomeHeight,
      expenseHeight,
      labelX: groupX + groupW.value / 2,
    };
  }),
);

const maxLabel = computed(() => formatMoney(max.value));

function shortMonth(value: string): string {
  const parsed = Number(value.split('-')[1] ?? value);
  return Number.isFinite(parsed) ? `${parsed}月` : value;
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    width="100%"
    role="img"
    aria-label="月度收入与支出趋势"
    class="trend"
  >
    <line :x1="PAD_X" :y1="PAD_TOP" :x2="W - PAD_X" :y2="PAD_TOP" class="trend__grid" />
    <line :x1="PAD_X" :y1="base" :x2="W - PAD_X" :y2="base" class="trend__axis" />
    <text :x="PAD_X" :y="PAD_TOP - 6" class="trend__axis-label">{{ maxLabel }}</text>

    <g v-for="bar in bars" :key="bar.month">
      <rect
        class="trend-bar"
        data-series="income"
        :x="bar.incomeX"
        :y="bar.incomeY"
        :width="barW"
        :height="bar.incomeHeight"
        fill="var(--income)"
        rx="2"
      />
      <rect
        class="trend-bar"
        data-series="expense"
        :x="bar.expenseX"
        :y="bar.expenseY"
        :width="barW"
        :height="bar.expenseHeight"
        fill="var(--expense)"
        rx="2"
      />
      <text :x="bar.labelX" :y="H - 9" text-anchor="middle" class="trend__label">
        {{ shortMonth(bar.month) }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.trend {
  display: block;
  width: 100%;
  min-width: 0;
  height: auto;
}

.trend__grid {
  stroke: var(--line);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.trend__axis {
  stroke: var(--line);
  stroke-width: 1;
}

.trend__axis-label {
  fill: var(--muted);
  font-family: var(--font-num);
  font-size: 10px;
}

.trend__label {
  fill: var(--ink);
  font-family: var(--font-sans);
  font-size: 12px;
}
</style>
