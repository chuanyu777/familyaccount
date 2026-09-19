<script setup lang="ts">
import { ref, useId } from 'vue';
import { useModalFocus } from '../composables/useModalFocus';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }>(),
  { description: '', confirmText: '确定', cancelText: '取消', danger: true },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const root = ref<HTMLElement | null>(null);
const titleId = useId();

useModalFocus(root, () => emit('cancel'));
</script>

<template>
  <Teleport to="body">
    <div class="overlay overlay--center" @click.self="emit('cancel')">
      <Transition name="pop" appear>
        <div ref="root" class="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
          <p v-if="description" class="dialog__desc">{{ description }}</p>
          <div class="dialog__actions">
            <button type="button" class="btn" @click="emit('cancel')">{{ cancelText }}</button>
            <button
              type="button"
              :class="['btn', danger ? 'btn--danger' : 'btn--primary']"
              @click="emit('confirm')"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
