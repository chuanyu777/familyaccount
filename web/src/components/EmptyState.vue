<script setup lang="ts">
withDefaults(defineProps<{ title: string; hint?: string; mark?: string }>(), {
  hint: '',
  mark: '—',
});
</script>

<template>
  <div class="empty">
    <div class="empty__mark" aria-hidden="true">{{ mark }}</div>
    <p class="empty__title">{{ title }}</p>
    <p v-if="hint" class="empty__hint">{{ hint }}</p>
  </div>
</template>
