# Task 6 实现报告

## 完成内容

- 更新 `mini/app.json`，按登录、账本引导、账本管理、邀请、设置和业务页面顺序注册全部 12 个页面。
- 补齐缺失的页面 JSON 文件；已使用的 `money-input`、`category-picker`、`confirm-dialog` 依赖在页面 JSON 中声明，组件不写入 `app.json`。
- 保留 `mini/project.config.json` 的 AppID 占位符，并在 `mini/README.md` 明确 AppID、开发/生产 API 地址和后端环境变量的替换位置。
- 明确小程序使用 `ledger_session` Cookie，不能用 `platform_session` 或 Authorization token 替代；不提交真实 secret。
- 新增微信开发者工具导入说明和 [小程序手工验收清单](../../../mini/docs/manual-test-checklist.md)，覆盖普通登录、无账本、创建/切换、邀请、OWNER/MEMBER、归档、特殊 Web 绑定和移除成员后的强制失效。
- 更新根 README，增加小程序入口和本地自动检查说明。

## 验证结果

- 通过：页面/JSON/组件路径检查，12 个页面路径均有对应源码和可解析 JSON。
- 通过：`npm test`，33 个测试文件、302 个测试全部通过。
- 通过：`npm run typecheck`。
- 通过：`git diff --check`。
- 未运行：微信开发者工具构建、真实微信登录、真实后端联调。本报告和手工清单没有将这些项目写成通过。

## 当前限制

- `mini/project.config.json`、`mini/lib/env.ts` 仍保留占位符，真实 AppID、开发/生产 API 地址和后端 secret 需要由部署/验收环境注入。
- 小程序页面必须在具备真实 DevTools、微信身份和可访问 HTTPS 后端的环境中完成发布前验收。

## Fix round 1

- 修正小程序手工验收清单的相对链接，使其从本报告所在目录正确解析到 `mini/docs/manual-test-checklist.md`。
