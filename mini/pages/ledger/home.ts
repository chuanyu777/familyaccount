import { currentLedgerStore } from '../../lib/currentLedger';
import { listLedgers } from '../../services/ledgers';
import { loadLedgerContext, type LedgerContext } from '../../services/members';
import type { LedgerSummary } from '../../types/domain';

interface LedgerHomeContext {
  data: { ledger: LedgerContext | null; ledgers: LedgerSummary[]; loading: boolean };
  setData(data: Record<string, unknown>): void;
}

const routes: Record<string, string> = {
  accounting: '/pages/accounting/index',
  assets: '/pages/assets/index',
  liabilities: '/pages/liabilities/index',
  analysis: '/pages/analysis/index',
  settings: '/pages/settings/index',
};

Page({
  data: {
    ledger: null,
    ledgers: [],
    loading: false,
    errorMessage: '',
    tabs: [
      { key: 'accounting', label: '记账' },
      { key: 'assets', label: '资产' },
      { key: 'liabilities', label: '负债' },
      { key: 'analysis', label: '分析' },
      { key: 'settings', label: '设置' },
    ],
  },
  async onShow(): Promise<void> {
    const page = this as unknown as LedgerHomeContext;
    const selected = currentLedgerStore.get();
    if (!selected) {
      page.setData({ ledger: null, ledgers: [], errorMessage: '' });
      return;
    }
    page.setData({ loading: true, errorMessage: '' });
    try {
      const [ledger, ledgers] = await Promise.all([
        loadLedgerContext(selected.id),
        listLedgers(),
      ]);
      currentLedgerStore.set(ledger);
      page.setData({ ledger: Object.freeze({ ...ledger }), ledgers });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '账本加载失败' });
    } finally {
      page.setData({ loading: false });
    }
  },
  handleTab(event: { currentTarget: { dataset: { tab: string } } }): void {
    const url = routes[event.currentTarget.dataset.tab];
    if (url) wx.navigateTo({ url });
  },
  handleSwitcher(): void { wx.navigateTo({ url: '/pages/ledger/list' }); },
});
