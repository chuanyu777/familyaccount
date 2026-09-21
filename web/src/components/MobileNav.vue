<script setup lang="ts">
import type { TabKey } from '../app/tabs';
import { TAB_DEFINITIONS } from '../app/tabs';

defineProps<{
  modelValue: TabKey;
}>();

defineEmits<{
  'update:modelValue': [tab: TabKey];
}>();
</script>

<template>
  <nav class="mobile-tabbar" aria-label="主导航">
    <button
      v-for="tab in TAB_DEFINITIONS"
      :key="tab.key"
      type="button"
      class="mobile-tabbar__item"
      :data-mobile-tab="tab.key"
      :aria-current="modelValue === tab.key ? 'page' : undefined"
      @click="$emit('update:modelValue', tab.key)"
    >
      <component
        :is="tab.icon"
        class="mobile-tabbar__icon"
        :size="20"
        :stroke-width="modelValue === tab.key ? 2.2 : 1.8"
        aria-hidden="true"
      />
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: calc(70px + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.mobile-tabbar__item {
  position: relative;
  min-width: 44px;
  min-height: 44px;
  padding: 8px 0 7px;
  border: 0;
  background: transparent;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.mobile-tabbar__item::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 50%;
  width: 24px;
  height: 3px;
  background: transparent;
  transform: translateX(-50%);
}

.mobile-tabbar__item[aria-current='page'] {
  color: var(--primary);
  font-weight: 600;
}

.mobile-tabbar__item[aria-current='page']::before {
  background: var(--primary);
}

.mobile-tabbar__icon {
  width: 20px;
  height: 20px;
  flex: none;
}

@media (min-width: 768px) {
  .mobile-tabbar {
    display: none;
  }
}
</style>
