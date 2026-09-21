<script setup lang="ts">
import EmptyState from './EmptyState.vue';

withDefaults(
  defineProps<{
    loading: boolean;
    error?: string;
    empty: boolean;
    emptyTitle?: string;
    emptyHint?: string;
  }>(),
  { error: '', emptyTitle: '暂无数据', emptyHint: '' },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading && empty" class="skeleton-list" aria-label="加载中">
    <div v-for="index in 4" :key="index" class="skeleton-list__row">
      <span class="skeleton skeleton-list__mark" />
      <span class="skeleton skeleton-list__line" />
      <span class="skeleton skeleton-list__value" />
    </div>
  </div>
  <div v-else-if="error && empty" class="async-error" role="alert">
    <span>{{ error }}</span>
    <button type="button" class="btn" @click="$emit('retry')">重试</button>
  </div>
  <template v-else>
    <div v-if="error" class="async-error" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn" @click="$emit('retry')">重试</button>
    </div>
    <slot v-if="!empty" />
    <EmptyState v-else :title="emptyTitle" :hint="emptyHint" />
  </template>
</template>
