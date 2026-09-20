<script setup lang="ts">
import MoneyText from '../../../components/MoneyText.vue';
import { sliceColor } from './palette';

export interface Slice {
  categoryId: number | null;
  name: string;
  cents: number;
  percent: number;
}

defineProps<{ data: Slice[] }>();

function barWidth(percent: number): string {
  return `${Math.min(100, Math.max(0, percent))}%`;
}
</script>

<template>
  <ul class="category-chart" aria-label="支出分类占比">
    <li
      v-for="(slice, index) in data"
      :key="(slice.categoryId ?? slice.name) as string"
      class="category-chart__row"
      data-category-bar
    >
      <div class="category-chart__label">
        <span class="category-chart__name">{{ slice.name }}</span>
        <span class="category-chart__percent">{{ slice.percent }}%</span>
      </div>
      <div class="category-chart__track" aria-hidden="true">
        <span
          class="category-chart__fill"
          :style="{ width: barWidth(slice.percent), background: sliceColor(index) }"
        />
      </div>
      <MoneyText class="category-chart__amount" :cents="slice.cents" tone="expense" />
    </li>
  </ul>
</template>

<style scoped>
.category-chart {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.category-chart__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sp-2) var(--sp-3);
  min-width: 0;
}

.category-chart__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  min-width: 0;
}

.category-chart__name {
  min-width: 0;
  color: var(--ink);
  font-size: var(--text-sm);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.category-chart__percent {
  flex: none;
  color: var(--ink);
  font-family: var(--font-num);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.category-chart__track {
  align-self: center;
  height: 8px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--bg);
}

.category-chart__fill {
  display: block;
  min-width: 2px;
  height: 100%;
  border-radius: inherit;
}

.category-chart__amount {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: end;
  white-space: nowrap;
  font-size: var(--text-sm);
}

@media (max-width: 380px) {
  .category-chart__row {
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--sp-2);
  }

  .category-chart__amount {
    font-size: var(--text-xs);
  }
}
</style>
