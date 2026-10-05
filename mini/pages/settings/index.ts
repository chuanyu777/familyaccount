import { currentLedgerStore } from '../../lib/currentLedger';
import { createInvitation } from '../../services/ledgers';
import { canRemoveMember, leaveMemberLedger, listMembers, loadLedgerContext, removeMember, updateLedgerName, type LedgerContext, type LedgerMember } from '../../services/members';
import type { InvitationView } from '../../types/domain';

interface SettingsPageContext { data: { ledger: LedgerContext | null; members: LedgerMember[]; loading: boolean; nameDraft: string }; setData(data: Record<string, unknown>): void; }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }

Page({
  data: { ledger: null, members: [], loading: false, errorMessage: '', invitation: null, nameDraft: '' },
  async onShow(): Promise<void> {
    const page = this as unknown as SettingsPageContext;
    const selected = currentLedgerStore.get();
    if (!selected) { page.setData({ errorMessage: '请先选择账本' }); return; }
    page.setData({ loading: true, errorMessage: '' });
    try {
      const [ledger, members] = await Promise.all([loadLedgerContext(selected.id), listMembers(selected.id)]);
      currentLedgerStore.set(ledger);
      page.setData({ ledger: Object.freeze({ ...ledger }), members, nameDraft: ledger.name });
    } catch (error) { page.setData({ errorMessage: errorMessage(error, '设置加载失败') }); }
    finally { page.setData({ loading: false }); }
  },
  handleNameInput(event: { detail: { value: string } }): void { (this as unknown as SettingsPageContext).setData({ nameDraft: event.detail.value }); },
  async handleRename(): Promise<void> {
    const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; const name = page.data.nameDraft.trim();
    if (!ledger || !name || ledger.role !== 'OWNER') return;
    try { const updated = await updateLedgerName(ledger.id, name); currentLedgerStore.set(updated); page.setData({ ledger: Object.freeze({ ...updated }), nameDraft: updated.name }); }
    catch (error) { page.setData({ errorMessage: errorMessage(error, '账本重命名失败') }); }
  },
  async handleInvite(): Promise<void> { const page = this as unknown as SettingsPageContext; try { page.setData({ invitation: await createInvitation() as InvitationView }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '邀请创建失败') }); } },
  async handleRemove(event: { currentTarget: { dataset: { member: LedgerMember } } }): Promise<void> {
    const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; const member = event.currentTarget.dataset.member;
    if (!ledger || !canRemoveMember(ledger.role, member.role)) return;
    try { await removeMember(ledger.id, member.id); page.setData({ members: await listMembers(ledger.id) }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '成员移除失败') }); }
  },
  async handleLeave(): Promise<void> { const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; if (!ledger || ledger.role === 'OWNER') return; try { await leaveMemberLedger(ledger.id); wx.reLaunch({ url: '/pages/ledger/list' }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '离开账本失败') }); } },
  handleBindWeb(): void { wx.navigateTo({ url: '/pages/bind-web/index' }); },
  handleSharedEdit(event: { currentTarget: { dataset: { tab: string } } }): void { const routes: Record<string, string> = { accounting: '/pages/accounting/index', assets: '/pages/assets/index', liabilities: '/pages/liabilities/index' }; const url = routes[event.currentTarget.dataset.tab]; if (url) wx.navigateTo({ url }); },
});
