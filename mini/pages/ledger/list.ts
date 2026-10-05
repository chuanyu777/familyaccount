import { currentLedgerStore } from '../../lib/currentLedger';
import { createInvitation, leaveLedger, listLedgers, switchLedger } from '../../services/ledgers';
import type { InvitationView, LedgerSummary } from '../../types/domain';

interface LedgerListPageContext {
  data: { ledgers: LedgerSummary[]; currentId: number | null; loading: boolean };
  setData(data: Record<string, unknown>): void;
}

Page({
  data: { ledgers: [], currentId: null, loading: false, errorMessage: '', invitation: null },
  async onShow(): Promise<void> {
    const page = this as unknown as LedgerListPageContext;
    page.setData({ loading: true, errorMessage: '' });
    try {
      const ledgers = await listLedgers();
      page.setData({ ledgers, currentId: currentLedgerStore.get()?.id ?? null });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '账本加载失败' });
    } finally {
      page.setData({ loading: false });
    }
  },
  handleCreate(): void { wx.navigateTo({ url: '/pages/ledger/create' }); },
  handleSwitch(event: { currentTarget: { dataset: { ledger: LedgerSummary } } }): void {
    switchLedger(event.currentTarget.dataset.ledger);
  },
  async handleInvite(): Promise<void> {
    const page = this as unknown as LedgerListPageContext;
    try { page.setData({ invitation: await createInvitation() as InvitationView }); }
    catch (error) { page.setData({ errorMessage: error instanceof Error ? error.message : '邀请创建失败' }); }
  },
  async handleLeave(event: { currentTarget: { dataset: { id: number } } }): Promise<void> {
    const page = this as unknown as LedgerListPageContext;
    const id = Number(event.currentTarget.dataset.id);
    try {
      await leaveLedger(id);
      page.setData({ ledgers: await listLedgers(), currentId: currentLedgerStore.get()?.id ?? null });
    } catch (error) { page.setData({ errorMessage: error instanceof Error ? error.message : '离开账本失败' }); }
  },
  onShareAppMessage(): { title: string; path: string } {
    const token = (this as unknown as LedgerListPageContext & { data: { invitation?: InvitationView } }).data.invitation?.token ?? '';
    return { title: '邀请你加入家庭账本', path: `/pages/invitation/detail?token=${encodeURIComponent(token)}` };
  },
});
