import { invitationTokenStore } from '../../services/auth';
import { isGuest } from '../../lib/guest';

interface EmptyPageContext {
  setData(data: { hasInvitation: boolean }): void;
}

Page({
  data: { hasInvitation: false },
  onShow(): void {
    if (isGuest()) { wx.reLaunch({ url: '/pages/accounting/index' }); return; }
    (this as unknown as EmptyPageContext).setData({ hasInvitation: Boolean(invitationTokenStore.get()) });
  },
  handleCreateLedger(): void {
    wx.navigateTo({ url: '/pages/ledger/create' });
  },
  handleAcceptInvitation(): void {
    const token = invitationTokenStore.get();
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    wx.navigateTo({ url: `/pages/invitation/detail${query}` });
  },
});
