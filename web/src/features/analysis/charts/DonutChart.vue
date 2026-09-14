<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '../../../lib/format';
import { sliceColor } from './palette';

export interface Slice {
  categoryId: number | null;
  name: string;
  cents: number;
  percent: number;
}

const props = defineProps<{ data: Slice[] }>();

const SIZE = 164;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 58;
const STROKE = 22;
const CIRC = 2 * Math.PI * R;

const total = computed(() => props.data.reduce((s, d) => s + d.cents, 0));

const segments = computed(() => {
  let offset = 0;
  return props.data.map((d, i) => {
    const dash = total.value > 0 ? (d.cents / total.value) * CIRC : 0;
    const seg = {
      d,
      color: sliceColor(i),
      dash,
      gap: CIRC - dash,
      offset,
    };
    offset += dash;
    return seg;
  });
});
</script>

<template>
  <svg
    :viewBox="`0 0 ${SIZE} ${SIZE}`"
    :width="SIZE"
    :height="SIZE"
    role="img"
    aria-label="支出分类占比"
    class="donut"
  >
    <circle :cx="CX" :cy="CY" :r="R" fill="none" stroke="var(--rule-soft)" :stroke-width="STROKE" />
    <circle
      v-for="s in segments"
      :key="(s.d.categoryId ?? s.d.name) as string"
      class="donut-segment"
      :cx="CX"
      :cy="CY"
      :r="R"
      fill="none"
      :stroke="s.color"
      :stroke-width="STROKE"
      :stroke-dasharray="`${s.dash} ${s.gap}`"
      :stroke-dashoffset="-(s.offset)"
      :transform="`rotate(-90 ${CX} ${CY})`"
    />
    <text :x="CX" :y="CY - 4" text-anchor="middle" class="donut-total">{{ formatMoney(total) }}</text>
    <text :x="CX" :y="CY + 14" text-anchor="middle" class="donut-cap">本月支出</text>
  </svg>
</template>

<style scoped>
.donut {
  display: block;
}

.donut-total {
  fill: var(--ink);
  font-size: 15px;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

.donut-cap {
  fill: var(--ink-3);
  font-size: 10px;
  font-family: var(--font-sans);
}
</style>
