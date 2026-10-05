# 微信小程序客户端

## 导入和配置

1. 使用微信开发者工具导入本目录 `mini/`，项目类型选择小程序。
2. 在 `mini/project.config.json` 的 `appid` 填入真实的小程序 AppID。这里不能填写 AppSecret。
3. 在 `mini/lib/env.ts` 的 `MINI_ENVIRONMENTS.development.apiBaseUrl` 填入开发后端的 HTTPS 地址，在 `production.apiBaseUrl` 填入生产后端的 HTTPS 地址。地址应是 API origin，例如 `https://dev-api.example.com`，不要附加 `/api`。
4. 当前构建环境由 `ACTIVE_ENVIRONMENT` 选择；提交代码时保留占位符，不要提交 AppSecret、数据库密码、会话密钥或其他凭据。
5. 开发地址必须能从真机或开发者工具访问，并满足微信业务域名配置；本地 `localhost` 不能作为真机可访问地址。生产地址必须使用 HTTPS。

`project.config.json` 只保存客户端工程元数据。后端配置写在部署环境的 `deploy/.env`，包括 `WECHAT_MINI_APP_ID`、`WECHAT_MINI_APP_SECRET`、`SESSION_SECRET` 和 `SESSION_COOKIE_SECURE=true` 等值，详见 [生产部署说明](../deploy/README.md)。

## 会话和接口约定

小程序登录调用后端微信登录接口，后续请求通过 `ledger_session` Cookie 认证。客户端不会发送 Authorization token，也不保存或接触微信 AppSecret；后端负责用 AppID/AppSecret 换取微信身份并签发会话。生产环境的网关、API 地址和 Cookie 必须按部署说明配置，不能把平台管理员的 `platform_session` 当作小程序会话。

## 页面入口

`app.json` 已注册完整页面流程：登录、可选 Web 绑定、无账本引导、账本列表/创建/主页、邀请接受、设置、记账、资产、负债和分析。页面级 JSON 仅声明实际使用的 `money-input`、`category-picker`、`confirm-dialog` 等组件；组件不写入 `app.json`。

## 验收

手工步骤见 [小程序手工验收清单](docs/manual-test-checklist.md)。清单中的“待真实环境验证”不能视为已通过；本仓库的自动检查只能覆盖 JSON、路由文件和 TypeScript/Vitest 检查，不能替代微信开发者工具构建或真实微信登录。
