<script setup lang="ts">
import { ref, useId } from 'vue';
import { useModalFocus } from '../composables/useModalFocus';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const root = ref<HTMLElement | null>(null);
const titleId = useId();

useModalFocus(root, () => emit('close'));
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <Transition name="sheet" appear>
        <div ref="root" class="sheet" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <div class="sheet__grip" aria-hidden="true" />
          <div class="sheet__head">
            <h2 :id="titleId" class="sheet__title">{{ title }}</h2>
            <button type="button" class="btn btn--ghost btn--sm sheet__close" @click="emit('close')">
              关闭
            </button>
          </div>
          <slot />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
