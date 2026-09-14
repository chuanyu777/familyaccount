<script setup lang="ts">
defineProps<{ title: string; aside?: string }>();
</script>

<template>
  <section class="section">
    <div class="section__head">
      <h2 class="section__title">{{ title }}</h2>
      <span v-if="aside" class="section__aside">{{ aside }}</span>
      <slot name="aside" />
    </div>
    <slot />
  </section>
</template>
