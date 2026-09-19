import { onBeforeUnmount, onMounted, ref } from 'vue';
import { tabFromHash, type TabKey } from '../app/tabs';

export function useHashTab(defaultTab: TabKey) {
  const activeTab = ref<TabKey>(tabFromHash(window.location.hash) ?? defaultTab);
  const sync = () => {
    activeTab.value = tabFromHash(window.location.hash) ?? defaultTab;
  };
  const setActiveTab = (tab: TabKey) => {
    if (window.location.hash !== `#${tab}`) window.location.hash = tab;
    activeTab.value = tab;
  };

  onMounted(() => window.addEventListener('hashchange', sync));
  onBeforeUnmount(() => window.removeEventListener('hashchange', sync));

  return { activeTab, setActiveTab };
}
