<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from './components/AppShell.vue';
import DesktopNav from './components/DesktopNav.vue';
import MobileTabBar from './components/MobileTabBar.vue';
import AppToast from './components/AppToast.vue';
import { useHashTab } from './composables/useHashTab';
import AccountingPage from './features/accounting/AccountingPage.vue';
import AssetsPage from './features/assets/AssetsPage.vue';
import LiabilitiesPage from './features/liabilities/LiabilitiesPage.vue';
import AnalysisPage from './features/analysis/AnalysisPage.vue';
import SettingsPage from './features/settings/SettingsPage.vue';
import { cachedGet } from './lib/api';
import { resourceVersion } from './lib/resourceInvalidation';

interface Family {
  id: number;
  name: string;
}

const PAGES = {
  accounting: AccountingPage,
  assets: AssetsPage,
  liabilities: LiabilitiesPage,
  analysis: AnalysisPage,
  settings: SettingsPage,
} as const;

const { activeTab, setActiveTab } = useHashTab('accounting');
const familyName = ref('我的家');
const currentPage = computed(() => PAGES[activeTab.value]);

async function loadFamily() {
  try {
    const family = await cachedGet<Family>('/api/family', undefined, { force: true });
    if (family?.name) familyName.value = family.name;
  } catch {
    /* 家庭名加载失败时保留默认名，不阻塞使用 */
  }
}

onMounted(loadFamily);
// 设置里改了家庭名，标题栏跟着变
watch(resourceVersion(['family']), loadFamily);
</script>

<template>
  <AppShell>
    <template #desktop-nav>
      <DesktopNav :model-value="activeTab" :family-name="familyName" @update:model-value="setActiveTab" />
    </template>

    <template #default>
      <Transition name="page" mode="out-in">
        <div :key="activeTab" class="page-layout" :data-page="activeTab">
          <component :is="currentPage" />
        </div>
      </Transition>
    </template>

    <template #mobile-nav>
      <MobileTabBar :model-value="activeTab" @update:model-value="setActiveTab" />
    </template>
  </AppShell>
  <AppToast />
</template>
