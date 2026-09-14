<script setup lang="ts">
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <Transition name="sheet" appear>
        <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
          <div class="sheet__grip" aria-hidden="true" />
          <div class="sheet__head">
            <h2 class="sheet__title">{{ title }}</h2>
            <button type="button" class="btn btn--ghost btn--sm" @click="emit('close')">关闭</button>
          </div>
          <slot />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
