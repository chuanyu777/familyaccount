# Mini Program Configuration

Before opening `mini/` in WeChat DevTools, replace these placeholders with
deployment-specific values:

- `mini/project.config.json`: `appid` is the non-secret WeChat Mini Program AppID.
- `mini/lib/env.ts`: `MINI_ENVIRONMENTS.development.apiBaseUrl` must be an HTTPS
  API origin reachable from the test device (for example, a temporary dev
  tunnel or a LAN host with the required WeChat domain configuration).
- `mini/lib/env.ts`: `MINI_ENVIRONMENTS.production.apiBaseUrl` must be the
  deployed HTTPS API origin.

Select the target at the app entry point with `setMiniEnvironment('development')`
or `setMiniEnvironment('production')`. Do not commit AppSecrets, session keys,
or other credentials; the backend owns those secrets.
