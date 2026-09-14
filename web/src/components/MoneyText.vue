<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '../lib/format';

const props = withDefaults(
  defineProps<{
    cents: number;
    tone?: 'income' | 'expense' | 'neutral' | 'muted';
    size?: 'md' | 'lg';
  }>(),
  { tone: 'neutral', size: 'md' },
);

const cls = computed(() => ['money', `money--${props.tone}`, props.size === 'lg' && 'money--lg']);
</script>

<template>
  <span :class="cls">{{ formatMoney(cents) }}</span>
</template>
