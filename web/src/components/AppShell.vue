<template>
  <div class="app-shell">
    <slot name="desktop-nav" />
    <main class="app-shell__main">
      <div class="app-shell__content">
        <slot />
      </div>
    </main>
    <slot name="mobile-nav" />
  </div>
</template>
