<script setup lang="ts">
/**
 * 分类图标组件（Web 端）。
 * 数据契约见 ../../../shared/category-icons.ts。
 * 未知 key 自动兜底为 'other'。
 */
import { computed } from 'vue';
import { getCategoryIconPath, resolveCategoryIconKey } from '@shared/category-icons';

interface Props {
  iconKey?: string | null;
  kind?: 'expense' | 'income' | 'transfer';
  size?: number;
}
const props = withDefaults(defineProps<Props>(), {
  iconKey: '',
  kind: 'expense',
  size: 28,
});

const key = computed(() => resolveCategoryIconKey(props.iconKey));
const path = computed(() => getCategoryIconPath(props.iconKey));
</script>

<template>
  <span
    class="category-icon"
    :class="[`kind-${kind}`, `key-${key}`]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="path" />
    </svg>
  </span>
</template>

<style scoped>
.category-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.category-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}
.category-icon.kind-expense { color: #3159d7; }
.category-icon.kind-income { color: #19765d; }
.category-icon.kind-transfer { color: #697080; }
</style>