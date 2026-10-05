import { captureInvitationToken } from './services/auth';

App({
  onLaunch(options: { query?: Record<string, unknown> }): void {
    captureInvitationToken(options.query);
  },
  onShow(options: { query?: Record<string, unknown> }): void {
    captureInvitationToken(options.query);
  },
});
