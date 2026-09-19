<script setup lang="ts">
import type { TabKey } from '../app/tabs';
import { TAB_DEFINITIONS } from '../app/tabs';

defineProps<{
  modelValue: TabKey;
  familyName: string;
}>();

defineEmits<{
  'update:modelValue': [tab: TabKey];
}>();
</script>

<template>
  <nav class="desktop-nav" aria-label="主导航">
    <div class="desktop-nav__inner">
      <span class="desktop-nav__brand">家庭财务</span>
      <div class="desktop-nav__tabs">
        <button
          v-for="tab in TAB_DEFINITIONS"
          :key="tab.key"
          type="button"
          class="desktop-nav__item"
          :aria-current="modelValue === tab.key ? 'page' : undefined"
          @click="$emit('update:modelValue', tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
      <span class="desktop-nav__family" :title="familyName">{{ familyName }}</span>
    </div>
  </nav>
</template>

<style scoped>
.desktop-nav {
  display: none;
  min-height: 64px;
  background: var(--nav);
  color: var(--surface);
}

.desktop-nav__inner {
  width: min(100% - 48px, var(--content-max));
  min-height: 64px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(120px, 1fr);
  align-items: center;
  gap: 24px;
}

.desktop-nav__brand {
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
}

.desktop-nav__tabs {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  gap: 4px;
}

.desktop-nav__item {
  position: relative;
  min-width: 64px;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: #b9c0d0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.desktop-nav__item::after {
  content: '';
  position: absolute;
  right: 16px;
  bottom: 0;
  left: 16px;
  height: 3px;
  background: transparent;
}

.desktop-nav__item:hover {
  color: var(--surface);
}

.desktop-nav__item[aria-current='page'] {
  color: var(--surface);
}

.desktop-nav__item[aria-current='page']::after {
  background: var(--primary);
}

.desktop-nav__family {
  justify-self: end;
  max-width: 100%;
  overflow: hidden;
  color: #b9c0d0;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 768px) {
  .desktop-nav {
    display: block;
  }
}
</style>
