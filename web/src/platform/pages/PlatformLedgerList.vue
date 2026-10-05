<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Search } from 'lucide-vue-next';
import { ApiError } from '../../lib/api';
import { platformApi } from '../platformApi';
import PlatformLedgerTable from '../components/PlatformLedgerTable.vue';
import type { PlatformLedgerSummary } from '../types';

const emit = defineEmits<{ open: [id: number] }>();
const search = ref('');
const ledgers = ref<PlatformLedgerSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let requestId = 0;

async function load(query = '') {
  const current = ++requestId;
  loading.value = true;
  error.value = null;
  try {
    const result = await platformApi.listLedgers(query.trim() || undefined);
    if (current === requestId) ledgers.value = result;
  } catch (cause) {
    if (current === requestId) {
      ledgers.value = [];
      error.value = cause instanceof ApiError && cause.status === 403
        ? '无权查看平台账本列表。请联系平台管理员。'
        : cause instanceof Error ? cause.message : '加载账本失败';
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <section class="platform-page" aria-label="账本列表">
    <div class="platform-page__heading"><div><h2>账本列表</h2><p>查看平台账本的基本信息</p></div><span v-if="!loading && !error" class="platform-page__count">{{ ledgers.length }} 个账本</span></div>
    <form class="platform-search" role="search" @submit.prevent="load(search)">
      <label for="platform-ledger-search">搜索账本</label>
      <div class="platform-search__controls"><input id="platform-ledger-search" v-model="search" type="search" placeholder="账本名称或 ID" /><button class="btn btn--primary" type="submit" :disabled="loading"><Search :size="18" />搜索</button></div>
    </form>
    <p v-if="loading" class="platform-status" role="status">正在加载账本…</p>
    <div v-else-if="error" class="async-error" role="alert"><span>{{ error }}</span><button class="btn btn--sm" type="button" @click="load(search)">重试</button></div>
    <p v-else-if="!ledgers.length" class="platform-empty">没有匹配的账本</p>
    <PlatformLedgerTable v-else :ledgers="ledgers" @open="emit('open', $event)" />
  </section>
</template>
