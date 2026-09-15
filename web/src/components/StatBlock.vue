<script setup lang="ts">
defineProps<{ label: string; hint?: string }>();
</script>

<template>
  <div class="stat">
    <span class="stat__label">{{ label }}</span>
    <div class="stat__value">
      <slot />
    </div>
    <span v-if="hint" class="stat__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 金额可能很长（百万级），必须允许被压窄，否则会把整格顶出容器 */
  min-width: 0;
  overflow: hidden;
  padding: var(--sp-3);
  background: var(--paper-raised);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}

.stat__label {
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat__value {
  min-width: 0;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  /* 同一组卡片由容器统一给 --stat-size，保证三个数字字号永远相等；
     不给时退回默认字号。不裁剪、不省略号，靠缩字号把长金额完整显示出来。 */
  font-size: var(--stat-size, var(--text-xl));
  line-height: 1.25;
  color: var(--ink);
  white-space: nowrap;
}

.stat__value :deep(.money) {
  display: block;
}

.stat__hint {
  font-size: var(--text-xs);
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
