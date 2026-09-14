<script setup lang="ts">
defineProps<{ label: string; hint?: string }>();
</script>

<template>
  <div class="stat">
    <span class="stat__label">{{ label }}</span>
    <div class="stat__value">
      <slot />
    </div>
    <span v-if="hint" class="stat__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}

.stat__label {
  font-size: var(--text-xs);
  color: var(--ink-3);
  letter-spacing: 0.08em;
}

.stat__value {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xl);
  line-height: 1.25;
  color: var(--ink);
}

.stat__hint {
  font-size: var(--text-xs);
  color: var(--ink-3);
}
</style>
