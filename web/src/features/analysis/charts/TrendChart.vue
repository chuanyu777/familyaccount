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

const W = 320;
const H = 208;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 44; /* 下方要放月份 + 结余两行 */
const plotW = W - PAD_X * 2;
const plotH = H - PAD_TOP - PAD_BOTTOM;
const base = PAD_TOP + plotH;

const max = computed(() =>
  Math.max(1, ...props.data.flatMap((d) => [d.incomeCents, d.expenseCents])),
);
const groupW = computed(() => plotW / Math.max(1, props.data.length));
const barW = computed(() => Math.min(12, groupW.value * 0.28));
const scale = (v: number) => (v / max.value) * plotH;

const bars = computed(() =>
  props.data.map((d, i) => {
    const gx = PAD_X + i * groupW.value;
    const inH = Math.max(0, scale(d.incomeCents));
    const exH = Math.max(0, scale(d.expenseCents));
    return {
      month: d.month,
      inX: gx + groupW.value * 0.16,
      exX: gx + groupW.value * 0.16 + barW.value + 3,
      inY: base - inH,
      exY: base - exH,
      inH,
      exH,
      netCents: d.netCents,
      labelX: gx + groupW.value / 2,
    };
  }),
);

const maxLabel = computed(() => formatMoney(max.value));

/** 结余小字：柱子下面一行，大额折成「万」，保证 6 个月都塞得下 */
function netLabel(cents: number): string {
  const v = cents / 100;
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}万`;
  return `${sign}${Math.round(abs)}`;
}

function shortMonth(month: string): string {
  const m = month.split('-')[1] ?? month;
  return `${Number(m)}月`;
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    width="100%"
    role="img"
    aria-label="月度收支趋势"
    class="trend"
  >
    <line :x1="PAD_X" :y1="PAD_TOP" :x2="W - PAD_X" :y2="PAD_TOP" class="grid" />
    <line :x1="PAD_X" :y1="base" :x2="W - PAD_X" :y2="base" class="axis" />
    <text :x="PAD_X" :y="PAD_TOP - 4" class="axis-label">{{ maxLabel }}</text>

    <g v-for="b in bars" :key="b.month">
      <rect
        class="trend-bar"
        :x="b.inX"
        :y="b.inY"
        :width="barW"
        :height="b.inH"
        fill="var(--income)"
        rx="1.5"
      />
      <rect
        class="trend-bar"
        :x="b.exX"
        :y="b.exY"
        :width="barW"
        :height="b.exH"
        fill="var(--expense)"
        rx="1.5"
      />
      <text :x="b.labelX" :y="base + 16" text-anchor="middle" class="x-label">
        {{ shortMonth(b.month) }}
      </text>
      <text
        :x="b.labelX"
        :y="base + 31"
        text-anchor="middle"
        class="net-label"
        :class="b.netCents < 0 ? 'is-expense' : 'is-income'"
      >
        {{ netLabel(b.netCents) }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.trend {
  display: block;
  width: 100%;
  height: auto;
}

.grid {
  stroke: var(--rule-soft);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.axis {
  stroke: var(--rule);
  stroke-width: 1;
}

.axis-label {
  fill: var(--ink-3);
  font-size: 9px;
  font-family: var(--font-num);
}

.x-label {
  fill: var(--ink-2);
  font-size: 11px;
  font-family: var(--font-sans);
}

/* 结余小字：绿正红负，放在月份下面 */
.net-label {
  font-size: 10px;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

.net-label.is-income {
  fill: var(--income-deep);
}

.net-label.is-expense {
  fill: var(--expense-deep);
}
</style>
