<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useWebAuth } from './useWebAuth';

const username = ref('');
const password = ref('');
const error = ref<string | null>(null);
const pending = ref(false);
const { session, login, logout, refresh } = useWebAuth('platform');

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
  <main v-if="session" class="platform-surface">
    <header class="platform-surface__header">
      <div>
        <p class="platform-surface__eyebrow">Platform Operations</p>
        <h1>平台控制台</h1>
      </div>
      <button type="button" class="btn btn--ghost" @click="logout">退出登录</button>
    </header>
    <section class="platform-surface__notice" aria-label="只读权限">
      <h2>只读访问</h2>
      <p>平台会话只能查看平台数据，账本写入和小程序绑定操作不在此入口提供。</p>
    </section>
  </main>
  <main v-else class="auth-page">
    <section class="auth-panel" aria-labelledby="platform-login-title">
      <p class="auth-panel__eyebrow">Platform Operations</p>
      <h1 id="platform-login-title">平台管理员登录</h1>
      <p class="auth-panel__hint">登录只读平台运营控制台。</p>
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
          {{ pending ? '登录中…' : '登录平台' }}
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

.auth-panel,
.platform-surface__notice {
  width: min(100%, 380px);
  padding: var(--sp-6);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--lift-2);
}

.auth-panel__eyebrow,
.platform-surface__eyebrow {
  margin-bottom: var(--sp-2);
  color: var(--primary);
  font-weight: 700;
}

.auth-panel h1,
.platform-surface h1 {
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

.platform-surface {
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--sp-6);
  background: var(--bg);
}

.platform-surface__header {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-4);
  width: min(100%, var(--content-max));
  margin: 0 auto var(--sp-6);
}

.platform-surface__notice {
  margin: 0 auto;
}

.platform-surface__notice p {
  margin-top: var(--sp-2);
  color: var(--muted);
}
</style>
