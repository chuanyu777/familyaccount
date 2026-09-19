<script setup lang="ts">
defineProps<{
  title: string;
  context?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__copy">
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="context" class="page-header__context">{{ context }}</p>
    </div>
    <div v-if="$slots.default" class="page-header__action">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header__copy {
  min-width: 0;
}

.page-header__title {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}

.page-header__context {
  margin-top: 2px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}

.page-header__action {
  flex: none;
}

@media (min-width: 768px) {
  .page-header {
    min-height: 48px;
  }

  .page-header__title {
    font-size: 22px;
  }

  .page-header__context {
    font-size: 13px;
  }
}
</style>
