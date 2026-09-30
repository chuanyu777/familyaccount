<template>
  <div class="app-shell">
    <slot name="desktop-nav" />
    <main class="app-shell__main">
      <div v-if="$slots['account-actions']" class="app-shell__account-actions">
        <slot name="account-actions" />
      </div>
      <div class="app-shell__content">
        <slot />
      </div>
    </main>
    <slot name="mobile-nav" />
  </div>
</template>

<style scoped>
.app-shell__account-actions {
  display: flex;
  justify-content: flex-end;
  width: min(100% - 32px, var(--content-max));
  margin: var(--sp-3) auto 0;
}
</style>
