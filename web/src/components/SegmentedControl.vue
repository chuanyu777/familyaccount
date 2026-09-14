<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T;
  options: { value: T; label: string }[];
  label?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [T] }>();
</script>

<template>
  <div class="segmented" role="group" :aria-label="label">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="segmented__item"
      :aria-pressed="modelValue === opt.value"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
