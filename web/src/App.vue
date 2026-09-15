<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue';
import TabBar from './components/TabBar.vue';
import AppToast from './components/AppToast.vue';
import AccountingPage from './features/accounting/AccountingPage.vue';
import AssetsPage from './features/assets/AssetsPage.vue';
import LiabilitiesPage from './features/liabilities/LiabilitiesPage.vue';
import AnalysisPage from './features/analysis/AnalysisPage.vue';
import SettingsPage from './features/settings/SettingsPage.vue';
import { cachedGet } from './lib/api';
import { revision } from './lib/revision';

interface Family {
  id: number;
  name: string;
}

const TABS = [
  { key: 'accounting', label: '记账' },
  { key: 'assets', label: '资产' },
  { key: 'liabilities', label: '负债' },
  { key: 'analysis', label: '分析' },
  { key: 'settings', label: '设置' },
];

const PAGES = {
  accounting: AccountingPage,
  assets: AssetsPage,
  liabilities: LiabilitiesPage,
  analysis: AnalysisPage,
  settings: SettingsPage,
} as const;

type TabKey = keyof typeof PAGES;

const active = ref<TabKey>('accounting');
const familyName = ref('我的家');

const current = shallowRef(PAGES[active.value]);

async function loadFamily() {
  try {
    const family = await cachedGet<Family>('/api/family', undefined, { force: true });
    if (family?.name) familyName.value = family.name;
  } catch {
    /* 家庭名加载失败时保留默认名，不阻塞使用 */
  }
}

function switchTab(key: string) {
  active.value = key as TabKey;
  current.value = PAGES[active.value];
}

onMounted(loadFamily);
// 设置里改了家庭名，标题栏跟着变
watch(revision, loadFamily);
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <h1 class="shell-header__title">家庭财务</h1>
      <span class="shell-header__family">{{ familyName }}</span>
    </header>

    <main class="shell-main">
      <Transition name="page" mode="out-in">
        <component :is="current" :key="active" />
      </Transition>
    </main>

    <TabBar :model-value="active" :tabs="TABS" @update:model-value="switchTab" />
    <AppToast />
  </div>
</template>
