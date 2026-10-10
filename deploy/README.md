# 生产部署

Docker Compose 启动 MySQL 8、Spring Boot 后端、Nginx Web 服务和 LangChain Agent Runtime（AI 助手）。浏览器直接访问 `https://<域名>/platform`（预置平台管理员，只读）或 `https://<域名>/ledger`（预置的两位特殊账本 Web 用户）。普通用户没有 Web 登录入口，使用微信小程序。`/platform`、`/ledger` 及其子路径由同一 SPA 入口处理，直接打开和刷新均应正常加载。旧 `/unlock.html` 只保留为跳转到 `/ledger` 的兼容链接，不再是登录或解锁入口。

## 配置环境变量

在 `deploy/.env` 中填写生产值。真实密码和微信密钥不要提交到 Git：

```dotenv
DB_PASSWORD=强数据库密码
SESSION_SECRET=至少 32 字符的随机字符串
SESSION_COOKIE_SECURE=true
WECHAT_MINI_APP_ID=小程序 AppID
WECHAT_MINI_APP_SECRET=小程序 AppSecret
SPECIAL_LEDGER_NAME=夫妻特殊账本
PLATFORM_ADMIN_USERNAME=平台管理员用户名
PLATFORM_ADMIN_PASSWORD=平台管理员密码
SPECIAL_LEDGER_OWNER_USERNAME=Web 用户名
SPECIAL_LEDGER_OWNER_PASSWORD=Web 密码
SPECIAL_LEDGER_MEMBER_USERNAME=配偶 Web 用户名
SPECIAL_LEDGER_MEMBER_PASSWORD=配偶 Web 密码
SPECIAL_LEDGER_OWNER_DISPLAY_NAME=本人
SPECIAL_LEDGER_MEMBER_DISPLAY_NAME=配偶
ASSISTANT_INTERNAL_TOKEN=至少 32 字符的随机字符串
DEEPSEEK_API_KEY=DeepSeek API Key
```

平台管理员和两位特殊账本用户由后端首次启动时预置。平台管理员只能查询平台账本数据，不能写账本；特殊账本 Web 用户只能访问配置的单一账本。生产环境必须设置非空 `SESSION_SECRET` 和 `SESSION_COOKIE_SECURE=true`，否则后端拒绝启动。更换 `SESSION_SECRET` 会使已签发的会话失效。

AI 助手另需两项必填配置，缺失时 compose 会直接拒绝启动：`ASSISTANT_INTERNAL_TOKEN` 由后端与 Agent Runtime 共享，用于校验 Agent 调用后端内部工具端点（`/api/assistant/internal/tools/*`），两侧必须一致，可在目标机器上用 `openssl rand -hex 24` 生成；`DEEPSEEK_API_KEY` 供 Agent 调用 DeepSeek。另有 `ASSISTANT_AGENT_URL`（默认 `http://agent:8090`）、`DEEPSEEK_MODEL`（默认 `deepseek-flash`）、`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）三项，通常无需修改。Agent 容器需要能出网访问 DeepSeek API，若部署环境有出网代理，请在 `deploy/docker-compose.prod.yml` 的 `agent` 服务上补 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`。

## 启动与更新

从仓库根目录运行：

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml logs -f app
```

默认启动四个服务：`mysql`、`app`、`web`（Nginx）、`agent`（AI 助手）。只有 Web Nginx 对外暴露主机 80 端口，`app`、`agent`、`mysql` 均只在 compose 内部网络可达——Agent 通过服务名 `app:3001` 访问后端，后端通过 `agent:8090` 访问 Agent，都无需经过公网。先在公网网关或负载均衡器上终止 TLS，并将公网 HTTP 重定向到 HTTPS。容器内 `deploy/nginx.conf` 仅监听 80 端口，不提供 TLS，也不执行 HTTP 到 HTTPS 跳转；按实际网络拓扑保护网关到容器的上游链路。Compose 映射主机 `80:80`，部署时应限制该端口只允许可信网关访问，避免绕过公网 HTTPS 入口。

四个服务都设置了 `restart: unless-stopped`，宿主机重启或容器异常退出后会自动拉起；Agent 的对话依赖 DeepSeek，接口不可用时助手会报错但不会影响记账等其它功能。

健康检查：

```bash
curl -i https://your-domain.example/healthz
```

数据库数据保存在 `mysql-data` 卷中。更新前先备份；不要执行 `docker compose down -v`，否则会删除数据库卷。备份和恢复脚本分别是 `deploy/backup.sh`、`deploy/restore.sh`。

## 同源 API 与会话

Web 使用相对路径 `/api/*` 并在请求中携带 cookie；浏览器页面和 API 必须处于相同协议、域名和端口，由 Nginx 把 `/api/` 代理到 `app:3001`。当前配置不会改写后端的 `Set-Cookie`。拆分前端/API 域名需要单独设计跨源凭据与 CORS，不能靠放宽 `SameSite` 实现。

- 平台登录：`POST /api/auth/platform/login`，使用 `platform_session`；只读查询 `/api/platform/ledgers` 和 `/api/platform/ledgers/{id}`。
- 特殊账本登录：`POST /api/auth/web/login`，使用 `ledger_session`；无需先绑定小程序。已登录账本用户可 `POST /api/auth/binding-code` 取得短期绑定码，再在小程序通过 `POST /api/auth/wechat/bind` 绑定。
- 会话检查：`GET /api/auth/session?kind=platform|ledger`；退出：`POST /api/auth/logout?kind=platform|ledger`，仅清除指定入口的 cookie。小程序使用 `POST /api/auth/wechat/login`。

两个 cookie 都使用 `Path=/; HttpOnly; SameSite=Strict`，生产登录 cookie 另带 `Secure`。因此同源请求可能同时携带两个 cookie；服务端根据接口和主体类型鉴权，平台 cookie 不授予账本权限，账本 cookie 不授予平台权限。浏览器只会通过 HTTPS 发送 Secure cookie，不要通过公网 HTTP 登录。

外部网关终止 TLS 时，容器 Nginx 收到 HTTP，当前传给后端的 `X-Forwarded-Proto` 是容器的 `$scheme`（`http`），并不证明浏览器使用了 HTTPS。当前认证签发由 `SESSION_COOKIE_SECURE` 决定，不依赖这个转发头。如未来后端需要识别外部协议，须先配置可信代理链，不能直接信任客户端提供的头。

上线验收按 [Web 手工检查清单](../web/docs/manual-test-checklist.md) 执行。

## 国内网络环境

前端镜像的 npm 安装默认使用 `https://registry.npmmirror.com`，可用构建参数 `NPM_REGISTRY` 覆盖；Agent 镜像的 pip 安装默认使用 `https://mirrors.cloud.tencent.com/pypi/simple/`，可用构建参数 `PIP_INDEX_URL` 覆盖。Docker 镜像、Maven 与 pip 依赖首次下载可能较慢，失败后重新执行同一条 `up -d --build` 命令即可复用已完成的层。
