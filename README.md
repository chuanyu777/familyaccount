# 家庭账簿

浏览器入口：`https://<域名>/platform`（只读平台管理员）和 `https://<域名>/ledger`（预置特殊账本用户）。普通用户使用微信小程序，没有 Web 登录入口。生产环境必须使用 HTTPS。

小程序入口：[mini/README.md](mini/README.md)。将 `mini/` 导入微信开发者工具后，替换 `mini/project.config.json` 的 AppID 和 `mini/lib/env.ts` 中开发/生产 API 地址占位符；不要提交 AppSecret 或后端会话密钥。后端必须能从设备或开发者工具访问，具体环境变量见 [生产部署说明](deploy/README.md)。

本地自动检查：在仓库根目录运行 `npm test` 和 `npm run typecheck`；还可运行 `git diff --check` 检查差异格式，以及按 [小程序手工验收清单](mini/docs/manual-test-checklist.md) 执行页面流程。微信开发者工具构建、真实微信登录和真实后端联调需要具备对应环境，不能由本地 Node 检查代替。

部署、环境变量、代理与会话要求见 [生产部署说明](deploy/README.md)；Web 验收场景见 [Web 手工检查清单](web/docs/manual-test-checklist.md)。
