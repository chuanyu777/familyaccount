# 家庭记账簿后端

这是 Java 17 + Spring Boot 3.3 + JdbcTemplate 实现的多租户账本后端。账本是唯一的租户边界，所有交易、账户、资产、负债、还款、快照和分类都带有 `ledger_id`，服务端会在每次业务请求中校验当前主体的账本成员关系。

## 运行

开发环境需要 JDK 17+ 和 MySQL 8。生产环境推荐使用仓库根目录的 Docker Compose：

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

只运行测试：

```bash
mvn -s mvn-settings.xml test
```

测试使用 H2 的 MySQL 兼容模式，并从全新 schema 初始化种子数据。

## 身份与入口

- 普通用户使用 `/api/auth/wechat/login` 登录。未知微信身份会创建新的 `app_user`，不会与其他用户自动合并。
- 特殊账本的两个预置 Web 用户使用 `/api/auth/web/login` 登录。Web session 只能访问唯一的 `is_web_enabled` 账本。
- Web 用户可以通过 `/api/auth/binding-code` 生成一次性绑定码，再在小程序调用 `/api/auth/wechat/bind`，将已有 Web 用户绑定到微信身份。
- 平台管理员使用 `/api/auth/platform/login` 登录，只能访问 `/api/platform/ledgers` 的只读查询接口。

平台管理员身份不是账本角色。账本角色只有 `OWNER` 和 `MEMBER`；普通成员只能修改或删除自己创建的交易、还款，账本所有者可以管理成员和共享资源。

## 配置

生产环境通过环境变量注入，不要把真实凭据提交到仓库：

```text
DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
SESSION_SECRET SESSION_TTL_SECONDS
WECHAT_MINI_APP_ID WECHAT_MINI_APP_SECRET WECHAT_API_BASE_URL
SPECIAL_LEDGER_NAME
PLATFORM_ADMIN_USERNAME PLATFORM_ADMIN_PASSWORD
SPECIAL_LEDGER_OWNER_DISPLAY_NAME SPECIAL_LEDGER_OWNER_USERNAME SPECIAL_LEDGER_OWNER_PASSWORD
SPECIAL_LEDGER_MEMBER_DISPLAY_NAME SPECIAL_LEDGER_MEMBER_USERNAME SPECIAL_LEDGER_MEMBER_PASSWORD
```

`Seeder` 会在新数据库中创建一个 Web-enabled 特殊账本、一个平台管理员、两个 Web 用户及其成员关系。`ensureSeeded()` 是幂等的；Web 密码只以哈希形式入库。

## 数据与权限约束

部署使用全新多租户 schema，不迁移旧单租户数据。共享账户、资产、负债和分类不物理删除，只能由 owner 归档或恢复；已归档资源不能用于新记录。余额变化和还款操作在事务中完成。
