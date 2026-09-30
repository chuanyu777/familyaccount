# 生产部署

部署由 Nginx、Spring Boot 后端和 MySQL 8 组成，外部只暴露 Nginx 的 80 端口。Spring Boot 使用 Java 17，数据库启动时从全新多租户 schema 初始化预置数据。

## 配置环境变量

在 `deploy/.env` 中填写生产值。真实密码和微信密钥不要提交到 Git：

```dotenv
DB_PASSWORD=强数据库密码
SESSION_SECRET=至少 32 字符的随机字符串
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
```

其中平台管理员和两个 Web 用户由后端首次启动时预置。平台管理员只能查看账本业务数据，不能调用账本写接口；普通用户通过微信小程序登录。Web 用户只能访问唯一的特殊账本。

## 启动与更新

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f app
```

健康检查：

```bash
curl -i http://服务器IP/healthz
```

数据库数据保存在 `mysql-data` 卷中。更新前先备份，更新时不要使用 `docker compose down -v`，否则会删除数据库卷。备份和恢复脚本分别是 `deploy/backup.sh`、`deploy/restore.sh`。

## 访问入口

- 小程序使用 `/api/auth/wechat/login`，登录后创建账本或接受邀请。
- 特殊 Web 端使用 `/api/auth/web/login`，绑定微信使用 `/api/auth/binding-code` 和 `/api/auth/wechat/bind`。
- 运营后台使用 `/api/auth/platform/login`，账本查询使用 `/api/platform/ledgers` 和 `/api/platform/ledgers/{id}`。

所有业务接口都需要对应的签名 session cookie。平台 session 和账本 session 相互隔离，不能交叉调用。

## 国内网络环境

前端镜像的 npm 安装默认使用 `https://registry.npmmirror.com`。如果服务器可以稳定访问官方 npm，可在构建时覆盖 `NPM_REGISTRY`。Docker 镜像和 Maven 依赖首次下载可能较慢，失败后重新执行同一条 `up -d --build` 命令即可复用已完成的层。
