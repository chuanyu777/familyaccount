import { currentLedgerStore } from '../../lib/currentLedger';
import { createInvitation } from '../../services/ledgers';
import { canRemoveMember, leaveMemberLedger, listMembers, loadLedgerContext, removeMember, updateLedgerName, type LedgerContext, type LedgerMember } from '../../services/members';
import { getProfile, updateProfile, uploadAvatar, type UserProfile } from '../../services/profile';
import type { InvitationView } from '../../types/domain';

type DisplayMember = LedgerMember & { initial: string; isMe: boolean };
interface SettingsPageContext { data: { ledger: LedgerContext | null; members: DisplayMember[]; profile: UserProfile | null; profileName: string; profileInitial: string; profileSaving: boolean; switcherOpen: boolean; renameOpen: boolean; loading: boolean; nameDraft: string; invitation: InvitationView | null }; setData(data: Record<string, unknown>): void; onShow(): Promise<void>; }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function initial(name: string): string { return name.trim().slice(0, 1) || '家'; }
function displayMembers(members: LedgerMember[], userId: number): DisplayMember[] { return members.map((member) => ({ ...member, initial: initial(member.displayName), isMe: member.userId === userId })).sort((a, b) => Number(b.isMe) - Number(a.isMe)); }

Page({
  data: { ledger: null, members: [], profile: null, profileName: '', profileInitial: '家', profileSaving: false, switcherOpen: false, renameOpen: false, loading: false, errorMessage: '', invitation: null, nameDraft: '' },
  async onShow(): Promise<void> {
    const page = this as unknown as SettingsPageContext;
    const selected = currentLedgerStore.get();
    if (!selected) { page.setData({ errorMessage: '请先选择账本' }); return; }
    page.setData({ loading: true, errorMessage: '' });
    try {
      const [ledger, members, profile] = await Promise.all([loadLedgerContext(selected.id), listMembers(selected.id), getProfile()]);
      currentLedgerStore.set(ledger);
      page.setData({ ledger: Object.freeze({ ...ledger }), members: displayMembers(members, profile.userId), profile, profileName: profile.displayName, profileInitial: initial(profile.displayName), nameDraft: ledger.name });
    } catch (error) { page.setData({ errorMessage: errorMessage(error, '设置加载失败') }); }
    finally { page.setData({ loading: false }); }
  },
  handleNameInput(event: { detail: { value: string } }): void { (this as unknown as SettingsPageContext).setData({ nameDraft: event.detail.value }); },
  openRename(): void { (this as unknown as SettingsPageContext).setData({ renameOpen: true }); },
  closeRename(): void { (this as unknown as SettingsPageContext).setData({ renameOpen: false }); },
  noop(): void {},
  async handleRename(): Promise<void> {
    const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; const name = page.data.nameDraft.trim();
    if (!ledger || !name || ledger.role !== 'OWNER') return;
    try { const updated = await updateLedgerName(ledger.id, name); currentLedgerStore.set(updated); page.setData({ ledger: Object.freeze({ ...updated }), nameDraft: updated.name, renameOpen: false }); }
    catch (error) { page.setData({ errorMessage: errorMessage(error, '账本重命名失败') }); }
  },
  async handleInvite(): Promise<void> { const page = this as unknown as SettingsPageContext; try { page.setData({ invitation: await createInvitation() as InvitationView }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '邀请创建失败') }); } },
  async handleRemove(event: { currentTarget: { dataset: { member: LedgerMember } } }): Promise<void> {
    const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; const member = event.currentTarget.dataset.member;
    if (!ledger || !canRemoveMember(ledger.role, member.role)) return;
    try { await removeMember(ledger.id, member.id); page.setData({ members: displayMembers(await listMembers(ledger.id), page.data.profile?.userId ?? -1) }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '成员移除失败') }); }
  },
  async handleLeave(): Promise<void> { const page = this as unknown as SettingsPageContext; const ledger = page.data.ledger; if (!ledger || ledger.role === 'OWNER') return; try { await leaveMemberLedger(ledger.id); wx.reLaunch({ url: '/pages/ledger/list' }); } catch (error) { page.setData({ errorMessage: errorMessage(error, '离开账本失败') }); } },
  handleProfileName(event: { detail: { value: string } }): void { (this as unknown as SettingsPageContext).setData({ profileName: event.detail.value }); },
  async saveProfileName(): Promise<void> {
    const page = this as unknown as SettingsPageContext;
    if (page.data.profileSaving || !page.data.profileName.trim()) return;
    page.setData({ profileSaving: true, errorMessage: '' });
    try {
      const profile = await updateProfile(page.data.profileName);
      page.setData({ profile, profileName: profile.displayName, profileInitial: initial(profile.displayName), members: displayMembers(await listMembers(page.data.ledger!.id), profile.userId) });
      wx.showToast({ title: '昵称已保存', icon: 'success' });
    } catch (error) { page.setData({ errorMessage: errorMessage(error, '昵称保存失败') }); }
    finally { page.setData({ profileSaving: false }); }
  },
  async handleChooseAvatar(event: { detail: { avatarUrl?: string } }): Promise<void> {
    const page = this as unknown as SettingsPageContext;
    const path = event.detail.avatarUrl;
    if (!path || page.data.profileSaving) return;
    page.setData({ profileSaving: true, errorMessage: '' });
    try { page.setData({ profile: await uploadAvatar(path) }); }
    catch (error) { page.setData({ errorMessage: errorMessage(error, '头像上传失败') }); }
    finally { page.setData({ profileSaving: false }); }
  },
  openCategoryManagement(): void { wx.navigateTo({ url: '/pages/categories/index' }); },
  openWebLedgerImport(): void { wx.navigateTo({ url: '/pages/bind-web/index' }); },
  openLedgerSwitcher(): void { (this as unknown as SettingsPageContext).setData({ switcherOpen: true }); },
  closeLedgerSwitcher(): void { (this as unknown as SettingsPageContext).setData({ switcherOpen: false }); },
  onShareAppMessage(): { title: string; path: string } {
    const invitation = (this as unknown as SettingsPageContext).data.invitation;
    return invitation
      ? { title: '邀请你加入家庭账本', path: `/pages/invitation/detail?token=${encodeURIComponent(invitation.token)}` }
      : { title: '家庭记账', path: '/pages/auth/index' };
  },
  handleSharedEdit(event: { currentTarget: { dataset: { tab: string } } }): void { const routes: Record<string, string> = { accounting: '/pages/accounting/index', assets: '/pages/assets/index', liabilities: '/pages/liabilities/index' }; const url = routes[event.currentTarget.dataset.tab]; if (url) wx.navigateTo({ url }); },
});
