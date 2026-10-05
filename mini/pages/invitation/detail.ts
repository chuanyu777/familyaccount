import { invitationTokenStore } from '../../services/auth';
import { acceptInvitation } from '../../services/ledgers';
interface InvitationPageContext { data: { token: string; loading: boolean }; setData(data: Record<string, unknown>): void; }
function invitationError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'INVITATION_INVALID') return '邀请已过期、撤销、使用过或无效';
  if (code === 'ALREADY_MEMBER' || code === 'INVITATION_ALREADY_USED') return '你已经加入该账本';
  return error instanceof Error ? error.message : '接受邀请失败，请重试';
}
Page({
  data: { token: '', loading: false, errorMessage: '' },
  onLoad(options: Record<string, unknown>): void { (this as unknown as InvitationPageContext).setData({ token: typeof options.token === 'string' ? options.token : invitationTokenStore.get() ?? '' }); },
  handleInput(event: { detail: { value: string } }): void { (this as unknown as InvitationPageContext).setData({ token: event.detail.value }); },
  async handleAccept(): Promise<void> {
    const page = this as unknown as InvitationPageContext; const token = page.data.token.trim();
    if (!token || page.data.loading) return; page.setData({ loading: true, errorMessage: '' });
    try { await acceptInvitation(token); invitationTokenStore.clear(); wx.reLaunch({ url: '/pages/ledger/home' }); }
    catch (error) { page.setData({ errorMessage: invitationError(error) }); }
    finally { page.setData({ loading: false }); }
  },
});
