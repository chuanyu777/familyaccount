import { captureInvitationToken, getPostAuthRoute, loginWithWeChat } from '../../services/auth';

interface AuthPageContext {
  data: { loading: boolean };
  setData(data: { loading?: boolean; errorMessage?: string }): void;
}

Page({
  data: { loading: false, errorMessage: '' },
  onLoad(options: Record<string, unknown>): void {
    captureInvitationToken(options);
  },
  async handleLogin(): Promise<void> {
    const page = this as unknown as AuthPageContext;
    if (page.data.loading) return;
    page.setData({ loading: true, errorMessage: '' });
    try {
      const result = await loginWithWeChat();
      wx.redirectTo({ url: getPostAuthRoute(result.ledgers) });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '登录失败，请重试' });
    } finally {
      page.setData({ loading: false });
    }
  },
  handleBindWeb(): void {
    wx.navigateTo({ url: '/pages/bind-web/index' });
  },
});
