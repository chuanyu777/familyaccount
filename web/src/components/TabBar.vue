<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  tabs: { key: string; label: string }[];
}>();

const emit = defineEmits<{ 'update:modelValue': [string] }>();

// 24px 线性图标（1.5px 描边、圆角线帽），不用图标库
const ICONS: Record<string, string> = {
  // 记账：账本方框 + 一笔
  accounting:
    'M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Z M9 9.5h5 M9 13h5',
  // 资产：钱包 + 圆点
  assets:
    'M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10Z M4 7.5V6a2 2 0 0 1 2-2h9 M15.5 13.5h.01',
  // 负债：银行卡 + 磁条
  liabilities:
    'M3.5 6.5h17a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z M2.5 10h19 M6 14.5h4',
  // 分析：三根高低柱状
  analysis:
    'M6 20v-6 M12 20V5 M18 20v-9 M4 20h16',
  // 设置：齿轮
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
};
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
      <svg
        class="tabbar__icon"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="ICONS[tab.key] ?? ''" />
      </svg>
      <span class="tabbar__label">{{ tab.label }}</span>
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
  background: var(--paper-raised);
  padding-bottom: var(--safe-bottom);
}

.tabbar__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 64px;
  padding: 8px 0;
  border: none;
  background: none;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink-2);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}

.tabbar__item.is-active {
  color: var(--brand);
  font-weight: 500;
}

.tabbar__icon {
  transition: stroke-width var(--dur-fast) var(--ease-out);
}

.tabbar__item.is-active .tabbar__icon {
  stroke-width: 2;
}
</style>
