<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { LogOut } from 'lucide-vue-next';
import { useWebAuth } from '../auth/useWebAuth';
import PlatformLedgerList from './pages/PlatformLedgerList.vue';
import PlatformLedgerDetail from './pages/PlatformLedgerDetail.vue';

const username = ref('');
const password = ref('');
const error = ref<string | null>(null);
const pending = ref(false);
const pathname = ref(window.location.pathname);
const { session, login, logout, refresh } = useWebAuth('platform');

const ledgerId = computed(() => {
  const match = /^\/platform\/ledgers\/([1-9]\d*)\/?$/.exec(pathname.value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
});

function syncPath() { pathname.value = window.location.pathname; }

function navigate(path: string) {
  window.history.pushState(null, '', path);
  syncPath();
}

async function submit() {
  if (pending.value) return;
  error.value = null;
  pending.value = true;
  try {
    await login(username.value.trim(), password.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败，请检查用户名和密码';
  } finally {
    pending.value = false;
  }
}

onMounted(() => {
  window.addEventListener('popstate', syncPath);
  void refresh();
});
onBeforeUnmount(() => window.removeEventListener('popstate', syncPath));
</script>

<template>
  <main v-if="session" class="platform-surface">
    <header class="platform-surface__header">
      <div><p class="platform-surface__eyebrow">Platform Operations</p><h1>平台控制台</h1></div>
      <button type="button" class="btn btn--ghost" @click="logout"><LogOut :size="17" />退出登录</button>
    </header>
    <div class="platform-surface__content">
      <PlatformLedgerDetail v-if="ledgerId !== null" :ledger-id="ledgerId" @back="navigate('/platform/ledgers')" />
      <PlatformLedgerList v-else @open="navigate(`/platform/ledgers/${$event}`)" />
    </div>
  </main>
  <main v-else class="auth-page">
    <section class="auth-panel" aria-labelledby="platform-login-title">
      <p class="auth-panel__eyebrow">Platform Operations</p>
      <h1 id="platform-login-title">平台管理员登录</h1>
      <p class="auth-panel__hint">登录只读平台运营控制台。</p>
      <form @submit.prevent="submit">
        <label class="field"><span class="field__label">用户名</span><input v-model="username" name="username" autocomplete="username" required /></label>
        <label class="field"><span class="field__label">密码</span><input v-model="password" name="password" type="password" autocomplete="current-password" required /></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">{{ pending ? '登录中…' : '登录平台' }}</button>
      </form>
    </section>
  </main>
</template>
