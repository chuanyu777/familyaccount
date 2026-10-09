<script setup lang="ts">
import { ref } from 'vue';
import { createMiniBindingCode } from '../lib/api';

const code = ref<string | null>(null);
const expiresAt = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function refreshCode() {
  if (loading.value) return;
  loading.value = true;
  error.value = null;
  copied.value = false;
  try {
    const result = await createMiniBindingCode();
    code.value = result.code;
    expiresAt.value = result.expiresAt;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '绑定码生成失败';
  } finally {
    loading.value = false;
  }
}

async function copyCode() {
  if (!code.value || !navigator.clipboard) return;
  await navigator.clipboard.writeText(code.value);
  copied.value = true;
}
</script>

<template>
  <section class="card mini-binding" aria-labelledby="mini-binding-title">
    <div class="content-section__head">
      <div>
        <h2 id="mini-binding-title">导入到微信</h2>
        <p class="page-header__context">为当前 Web 账号生成一次性导入码，十分钟内有效。</p>
      </div>
      <button type="button" class="btn btn--ghost" :disabled="loading" @click="refreshCode">
        {{ code ? '刷新导入码' : '生成导入码' }}
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <div v-if="code" class="mini-binding__code" aria-live="polite">
      <code>{{ code }}</code>
      <span>有效期至 {{ formatExpiry(expiresAt ?? '') }}</span>
      <button type="button" class="btn btn--sm" @click="copyCode">
        {{ copied ? '已复制' : '复制绑定码' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.mini-binding {
  margin-top: var(--sp-5);
}

.mini-binding__code {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.mini-binding__code code {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: var(--font-num);
  font-size: 1.05rem;
  font-weight: 700;
}

.mini-binding__code span {
  color: var(--muted);
  font-size: var(--text-sm);
}
</style>
