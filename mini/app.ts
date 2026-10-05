import { captureInvitationToken, invitationTokenStore } from './services/auth';
import { sessionStore } from './lib/session';

App({
  onLaunch(options: { query?: Record<string, unknown> }): void {
    captureInvitationToken(options.query);
  },
  onShow(options: { path?: string; query?: Record<string, unknown> }): void {
    captureInvitationToken(options.query);
    const token = invitationTokenStore.get();
    if (token && sessionStore.get() && options.query?.token && options.path !== 'pages/invitation/detail') {
      wx.navigateTo({ url: `/pages/invitation/detail?token=${encodeURIComponent(token)}` });
    }
  },
});
