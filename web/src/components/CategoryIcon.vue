<script setup lang="ts">
/**
 * 分类图标组件（Web 端）—— emoji 风格。
 * 数据契约见 @shared/category-icons.ts：icon_key → emoji 映射。
 * 未知 key 自动兜底为 'other'。
 */
import { computed } from 'vue';
import { getCategoryIconEmoji, resolveCategoryIconKey } from '@shared/category-icons';

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
const emoji = computed(() => getCategoryIconEmoji(props.iconKey));
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.62)}px`,
}));
</script>

<template>
  <span class="category-icon" :class="[`kind-${kind}`, `key-${key}`]" :style="style" aria-hidden="true">{{
    emoji
  }}</span>
</template>

<style scoped>
.category-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
  user-select: none;
}
</style>