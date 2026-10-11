import { captureInvitationToken, getPostAuthRoute, loginWithWeChat } from '../../services/auth';
import { activeEnvironment, getMiniConfig } from '../../lib/env';

interface AuthPageContext {
  data: { loading: boolean; endpoint: string };
  setData(data: { loading?: boolean; errorMessage?: string }): void;
}

Page({
  data: {
    loading: false,
    errorMessage: '',
    // 显示当前构建实际请求的地址：体验版/正式版应显示 https 域名。
    // 若这里出现 127.0.0.1，说明手上的包是旧构建，重新上传体验版即可。
    endpoint: `${getMiniConfig().apiBaseUrl}（${activeEnvironment() === 'production' ? '生产' : '本地开发'}）`,
  },
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
