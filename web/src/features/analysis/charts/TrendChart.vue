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
const H = 188;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;
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
      labelX: gx + groupW.value / 2,
    };
  }),
);

const maxLabel = computed(() => formatMoney(max.value));

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
      <text :x="b.labelX" :y="H - 8" text-anchor="middle" class="x-label">
        {{ shortMonth(b.month) }}
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
</style>
