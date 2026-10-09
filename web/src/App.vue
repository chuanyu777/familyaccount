<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
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
import MiniBindingPanel from './auth/MiniBindingPanel.vue';
import AssistantPanel from './features/assistant/AssistantPanel.vue';
import type { LedgerPermissions, LedgerSession, LedgerSummary } from './auth/types';

defineEmits<{
  logout: [];
}>();

const props = withDefaults(defineProps<{
  session: LedgerSession;
  ledger: LedgerSummary;
  permissions: LedgerPermissions;
}>(), {
  session: () => ({ type: 'LEDGER_USER' as const, userId: 0 }),
  ledger: () => ({ id: 0, name: '我的账本', role: 'OWNER', active: true, webLoginAllowed: true }),
  permissions: () => ({ isOwner: true, canManageMembers: true, canRenameLedger: true, canArchiveResources: true }),
});

const PAGES = {
  accounting: AccountingPage,
  assets: AssetsPage,
  liabilities: LiabilitiesPage,
  analysis: AnalysisPage,
  settings: SettingsPage,
} as const;

const { activeTab, setActiveTab } = useHashTab('accounting');
const currentPage = computed(() => PAGES[activeTab.value]);

function redirectToLedgerLogin(event: Event) {
  const detail = (event as CustomEvent<{ kind?: string }>).detail;
  if (detail?.kind === 'ledger') window.location.replace('/ledger');
}

onMounted(() => window.addEventListener('web-auth-lost', redirectToLedgerLogin));
onBeforeUnmount(() => window.removeEventListener('web-auth-lost', redirectToLedgerLogin));
</script>

<template>
  <AppShell>
    <template #account-actions>
      <button type="button" class="btn btn--ghost" @click="$emit('logout')">退出登录</button>
    </template>
    <template #desktop-nav>
      <DesktopNav :model-value="activeTab" :family-name="ledger.name" @update:model-value="setActiveTab" />
    </template>

    <template #default>
      <Transition name="page" mode="out-in">
        <div :key="activeTab" class="page-layout" :data-page="activeTab">
          <component :is="currentPage" :session="session" :permissions="permissions" />
          <MiniBindingPanel v-if="activeTab === 'settings'" />
        </div>
      </Transition>
    </template>

    <template #mobile-nav>
      <MobileNav :model-value="activeTab" @update:model-value="setActiveTab" />
    </template>
  </AppShell>
  <AssistantPanel />
  <AppToast />
</template>
