<script setup lang="ts">
import { onMounted, ref } from 'vue';
import App from '../App.vue';
import { useWebAuth } from './useWebAuth';

const username = ref('');
const password = ref('');
const error = ref<string | null>(null);
const pending = ref(false);
const { session, login, logout, refresh } = useWebAuth('ledger');

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

onMounted(() => void refresh());
</script>

<template>
  <App v-if="session" @logout="logout" />
  <main v-else class="auth-page">
    <section class="auth-panel" aria-labelledby="ledger-login-title">
      <p class="auth-panel__eyebrow">家庭财务</p>
      <h1 id="ledger-login-title">账本登录</h1>
      <p class="auth-panel__hint">登录特殊账本 Web 客户端。</p>
      <form @submit.prevent="submit">
        <label class="field">
          <span class="field__label">用户名</span>
          <input v-model="username" name="username" autocomplete="username" required />
        </label>
        <label class="field">
          <span class="field__label">密码</span>
          <input v-model="password" name="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="btn btn--primary btn--block" type="submit" :disabled="pending">
          {{ pending ? '登录中…' : '登录账本' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  padding: var(--sp-5);
  background: var(--bg);
}

.auth-panel {
  width: min(100%, 380px);
  padding: var(--sp-6);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--lift-2);
}

.auth-panel__eyebrow {
  margin-bottom: var(--sp-2);
  color: var(--primary);
  font-weight: 700;
}

.auth-panel h1 {
  font-size: var(--text-2xl);
}

.auth-panel__hint {
  margin: var(--sp-2) 0 var(--sp-5);
  color: var(--muted);
}

.field + .field {
  margin-top: var(--sp-4);
}

.auth-panel .btn {
  margin-top: var(--sp-5);
}
</style>
