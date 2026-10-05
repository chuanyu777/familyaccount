import { invitationTokenStore } from '../../services/auth';
import { acceptInvitation } from '../../services/ledgers';
import { ApiError } from '../../lib/errors';
interface InvitationPageContext { data: { token: string; loading: boolean }; setData(data: Record<string, unknown>): void; }
export function invitationError(error: unknown, missingToken = false): string {
  if (missingToken) return '请输入邀请口令';
  if (error instanceof ApiError && error.status >= 500) return '服务暂时不可用，请稍后重试';
  if (!(error instanceof ApiError) && error instanceof Error) return '网络请求失败，请检查网络后重试';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'INVITATION_INVALID') return '邀请无效或已失效';
  return error instanceof Error ? error.message : '接受邀请失败，请重试';
}
Page({
  data: { token: '', loading: false, errorMessage: '' },
  onLoad(options: Record<string, unknown>): void { (this as unknown as InvitationPageContext).setData({ token: typeof options.token === 'string' ? options.token : invitationTokenStore.get() ?? '' }); },
  handleInput(event: { detail: { value: string } }): void { (this as unknown as InvitationPageContext).setData({ token: event.detail.value }); },
  async handleAccept(): Promise<void> {
    const page = this as unknown as InvitationPageContext; const token = page.data.token.trim();
    if (page.data.loading) return;
    if (!token) { page.setData({ errorMessage: invitationError(undefined, true) }); return; }
    page.setData({ loading: true, errorMessage: '' });
    try { await acceptInvitation(token); invitationTokenStore.clear(); wx.reLaunch({ url: '/pages/ledger/home' }); }
    catch (error) { page.setData({ errorMessage: invitationError(error) }); }
    finally { page.setData({ loading: false }); }
  },
});
