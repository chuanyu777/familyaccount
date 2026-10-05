# Task 2 实现报告

## 完成内容

- 新增 `mini/services/auth.ts`：微信登录、Web 绑定、登出、登录后账本刷新和认证路由。
- 登录调用 `POST /api/auth/wechat/login`，绑定调用 `POST /api/auth/wechat/bind`，均使用 `wx.login` 返回的 code。
- 继续使用请求层的 `ledger_session` Cookie，没有新增 Bearer token 或 openid 传输。
- 认证成功后调用 `GET /api/ledgers`；无账本进入 `pages/ledger/empty`，有账本进入 `pages/ledger/list`，并保存最近账本。
- 新增微信登录页、可选 Web 绑定页和无账本页；绑定入口没有放入默认登录页。
- 在 `app.onLaunch`、`app.onShow` 和认证页保留启动/分享 query 中的 `token`，无邀请预览请求；无账本页只导航到后续创建/邀请详情页面。
- 按约定未修改 `mini/app.json`，页面注册由主 agent 统一合并。

## 测试

- `npm test -- mini/services/auth.test.ts`：5 tests passed。
- `npm test`：25 test files、265 tests passed。
- `npm run typecheck`：通过。
- `git diff --check`：通过。

## 未覆盖

- 未在微信开发者工具中进行真实微信授权、Cookie 和页面跳转联调；需要接入可访问的后端环境后手工验证。

## Fix Round 1

- 修复认证页空模板：默认登录路径现在显示可操作的微信登录按钮、加载态和错误提示；没有新增 Web 绑定入口。
- 修复认证成功后的账本恢复：优先恢复 `currentLedgerStore` 中仍属于当前用户的账本；无可恢复账本时使用稳定的首个账本，不再使用返回列表最后一项。
- 补充回归测试，覆盖已保存账本仍可用和已保存账本不可用两种情况。
- 跨任务约束：绑定入口不放入 auth/empty 页面；按当前主控 ruling，绑定入口由 Task 4 settings 页承担，并且必须保持 settings-only secondary entry。

### 命令与结果

- `npm test -- mini/services/auth.test.ts`：7 tests passed。
- `npm test`：25 test files、267 tests passed。
- `npm run typecheck`：通过。
- `git diff --check`：通过。
