<script lang="ts">
export interface SummaryMetric {
  label: string;
  cents: number;
  tone?: 'income' | 'expense' | 'neutral';
}
</script>

<script setup lang="ts">
import MoneyText from './MoneyText.vue';

defineProps<{
  primary: SummaryMetric;
  secondary: SummaryMetric[];
}>();
</script>

<template>
  <dl class="summary-strip">
    <div class="summary-strip__primary">
      <dt class="summary-strip__label">{{ primary.label }}</dt>
      <dd class="summary-strip__value">
        <MoneyText :cents="primary.cents" :tone="primary.tone" size="lg" />
      </dd>
    </div>
    <div
      v-for="metric in secondary.slice(0, 2)"
      :key="metric.label"
      class="summary-strip__secondary"
    >
      <dt class="summary-strip__label">{{ metric.label }}</dt>
      <dd class="summary-strip__value">
        <MoneyText :cents="metric.cents" :tone="metric.tone" />
      </dd>
    </div>
  </dl>
</template>
