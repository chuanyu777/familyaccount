import { invitationTokenStore } from '../../services/auth';

interface EmptyPageContext {
  setData(data: { hasInvitation: boolean }): void;
}

Page({
  data: { hasInvitation: false },
  onShow(): void {
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
  handleImportWebLedger(): void {
    wx.navigateTo({ url: '/pages/bind-web/index' });
  },
});
