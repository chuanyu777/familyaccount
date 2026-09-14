<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  tabs: { key: string; label: string }[];
}>();

const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<template>
  <nav class="tabbar" aria-label="主导航">
    <button
      v-for="tab in props.tabs"
      :key="tab.key"
      type="button"
      class="tabbar__item"
      :class="{ 'is-active': props.modelValue === tab.key }"
      :aria-current="props.modelValue === tab.key ? 'page' : undefined"
      @click="emit('update:modelValue', tab.key)"
    >
      <span class="tabbar__mark" aria-hidden="true" />
      {{ tab.label }}
    </button>
  </nav>
</template>

<style scoped>
.tabbar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  border-top: 1px solid var(--rule);
  background: color-mix(in oklab, var(--paper-raised) 92%, transparent);
  backdrop-filter: blur(8px);
  padding-bottom: var(--safe-bottom);
}

.tabbar__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 60px;
  padding: 11px 0;
  border: none;
  background: none;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}

.tabbar__item.is-active {
  color: var(--brand-deep);
  font-weight: 600;
}

/* 当前页标记：一条短横线，选中时才显形 */
.tabbar__mark {
  width: 20px;
  height: 3px;
  border-radius: 2px;
  background: transparent;
  transition: background var(--dur) var(--ease-out);
}

.tabbar__item.is-active .tabbar__mark {
  background: var(--brand);
}
</style>
