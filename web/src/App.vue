<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppShell from './components/AppShell.vue';
import DesktopNav from './components/DesktopNav.vue';
import MobileNav from './components/MobileNav.vue';
import AppToast from './components/AppToast.vue';
import { useHashTab } from './composables/useHashTab';
import AccountingPage from './features/accounting/AccountingPage.vue';
import AssetsPage from './features/assets/AssetsPage.vue';
import LiabilitiesPage from './features/liabilities/LiabilitiesPage.vue';
import AnalysisPage from './features/analysis/AnalysisPage.vue';
import SettingsPage from './features/settings/SettingsPage.vue';
import { cachedGet } from './lib/api';
import { resourceVersion } from './lib/resourceInvalidation';
import MiniBindingPanel from './auth/MiniBindingPanel.vue';

defineEmits<{
  logout: [];
}>();

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

function redirectToLedgerLogin(event: Event) {
  const detail = (event as CustomEvent<{ kind?: string }>).detail;
  if (detail?.kind === 'ledger') window.location.replace('/ledger');
}

async function loadFamily() {
  try {
    const family = await cachedGet<Family>('/api/family', undefined, { force: true });
    if (family?.name) familyName.value = family.name;
  } catch {
    /* 家庭名加载失败时保留默认名，不阻塞使用 */
  }
}

onMounted(loadFamily);
onMounted(() => window.addEventListener('web-auth-lost', redirectToLedgerLogin));
onBeforeUnmount(() => window.removeEventListener('web-auth-lost', redirectToLedgerLogin));
// 设置里改了家庭名，标题栏跟着变
watch(resourceVersion(['family']), loadFamily);
</script>

<template>
  <AppShell>
    <template #account-actions>
      <button type="button" class="btn btn--ghost" @click="$emit('logout')">退出登录</button>
    </template>
    <template #desktop-nav>
      <DesktopNav :model-value="activeTab" :family-name="familyName" @update:model-value="setActiveTab" />
    </template>

    <template #default>
      <Transition name="page" mode="out-in">
        <div :key="activeTab" class="page-layout" :data-page="activeTab">
          <component :is="currentPage" />
          <MiniBindingPanel v-if="activeTab === 'settings'" />
        </div>
      </Transition>
    </template>

    <template #mobile-nav>
      <MobileNav :model-value="activeTab" @update:model-value="setActiveTab" />
    </template>
  </AppShell>
  <AppToast />
</template>
