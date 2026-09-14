<script setup lang="ts">
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
</script>

<template>
  <Teleport to="body">
    <div class="overlay overlay--center" @click.self="emit('cancel')">
      <Transition name="pop" appear>
        <div class="dialog" role="dialog" aria-modal="true" :aria-label="props.title">
          <h2 class="dialog__title">{{ title }}</h2>
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
