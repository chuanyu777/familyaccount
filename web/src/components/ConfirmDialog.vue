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
    pending?: boolean;
    error?: string;
  }>(),
  {
    description: '',
    confirmText: '确定',
    cancelText: '取消',
    danger: true,
    pending: false,
    error: '',
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const root = ref<HTMLElement | null>(null);
const titleId = useId();

function requestCancel() {
  if (!props.pending) emit('cancel');
}

function requestConfirm() {
  if (!props.pending) emit('confirm');
}

useModalFocus(root, requestCancel);
</script>

<template>
  <Teleport to="body">
    <div class="overlay overlay--center" @click.self="requestCancel">
      <Transition name="pop" appear>
        <div
          ref="root"
          class="dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-busy="pending"
        >
          <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
          <p v-if="description" class="dialog__desc">{{ description }}</p>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <div class="dialog__actions">
            <button type="button" class="btn" :disabled="pending" @click="requestCancel">
              {{ cancelText }}
            </button>
            <button
              type="button"
              :class="['btn', danger ? 'btn--danger' : 'btn--primary']"
              :disabled="pending"
              @click="requestConfirm"
            >
              {{ pending ? `${confirmText}中…` : confirmText }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
