# 生产部署

单台云服务器（2C4G / CentOS 7 / 115.159.161.178）上的 Docker Compose 部署，域名 `theseven.cc`。

## 一、架构

```
公网 ──443(HTTPS) / 80(仅 301 跳转)──▶ tls (Nginx 反代，唯一对外)
                                          │
                                          ▼
                                 web ──▶ app ──▶ mysql
                                          │
                                          └──▶ agent ──▶ DeepSeek
```

| 服务 | 镜像 | 端口 | 说明 |
| --- | --- | --- | --- |
| `tls` | nginx:1.27-alpine | **对外 80 + 443** | 终止 TLS；80 只做跳转，不承载业务 |
| `web` | deploy-web | 仅内网 | Nginx：前端静态文件 + 反代 `/api` 到 app |
| `app` | deploy-app | 仅内网 3001 | Spring Boot 后端，唯一持有数据库凭证 |
| `agent` | deploy-agent | 仅内网 8090 | LangChain 助手运行时，不连数据库 |
| `mysql` | mysql:8.0 | 仅内网 | 数据持久化在卷 `deploy_mysql-data` |

**只有 `tls` 暴露端口**，其余四个仅内部网络可达。这样「用 http 绕过 HTTPS」从根上不成立，也不需要云负载或安全组限制来源。

### 访问地址

- 账本 Web 端：`https://theseven.cc/ledger`
- 平台管理员（只读）：`https://theseven.cc/platform`

账号密码由 `deploy/.env` 决定，**首次启动时预置**。用 IP 或不带协议访问会被 301 跳到 https 域名。

## 二、目录与关键文件

服务器上的部署目录 `/root/family-ledger/deploy/`：

```
deploy/
├── docker-compose.prod.yml   # 五个服务的编排
├── nginx-tls.conf            # tls 反代配置（证书路径、TLS 版本、upstream 延迟解析）
├── certs/                    # 证书与私钥（已在 .gitignore，绝不进仓库）
│   ├── theseven.cc_bundle.crt
│   └── theseven.cc.key       # 权限必须 600
├── .env                      # 生产密钥（权限 600，绝不进仓库）
├── backup.sh / restore.sh    # 备份与恢复
└── upgrade.sh                # 更新部署（见第五节）
```

## 三、配置环境变量

`.env` 必填项（缺失时 compose 会直接拒绝启动）：

```dotenv
DB_PASSWORD=数据库密码
SESSION_SECRET=会话签名密钥（≥32 字符随机）
SESSION_COOKIE_SECURE=true          # 生产必须 true
SPRING_PROFILES_ACTIVE=prod         # 生产必须 prod
WECHAT_MINI_APP_ID=小程序 AppID
WECHAT_MINI_APP_SECRET=小程序 AppSecret
SPECIAL_LEDGER_NAME=特殊账本名称
PLATFORM_ADMIN_USERNAME=平台管理员用户名
PLATFORM_ADMIN_PASSWORD=平台管理员密码
SPECIAL_LEDGER_OWNER_USERNAME=账本 Web 用户名
SPECIAL_LEDGER_OWNER_PASSWORD=账本 Web 密码
SPECIAL_LEDGER_MEMBER_USERNAME=配偶 Web 用户名
SPECIAL_LEDGER_MEMBER_PASSWORD=配偶 Web 密码
ASSISTANT_INTERNAL_TOKEN=助手内部令牌（≥32 字符随机）
DEEPSEEK_API_KEY=DeepSeek API Key
```

可选：`ASSISTANT_AGENT_URL`（默认 `http://agent:8090`）、`DEEPSEEK_MODEL`（默认 `deepseek-flash`）、`DEEPSEEK_BASE_URL`。

**在服务器上现场生成密钥，不要让明文经过聊天或工单**：

```bash
cd /root/family-ledger/deploy
DBPW=$(openssl rand -hex 24)
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DBPW|" .env
# SESSION_SECRET / ASSISTANT_INTERNAL_TOKEN 同理
chmod 600 .env
```

> **⚠️ 平台管理员与两位账本用户的密码只在「首次启动」时预置。**
> 第一次 `up` 之前必须改好；之后再改需要手动改数据库或重建库。

## 四、本地开发启动（★ 微信开发者工具要连的那套）

生产配置里 `web` **刻意不暴露任何端口**，公网只由 `tls` 层作为唯一入口。本地开发因此**不能**直接
`docker-compose -f docker-compose.prod.yml up` —— 那样起的 web 没有端口映射，开发者工具会连不上。

本地用 `docker-compose.local.yml` 覆盖，把 web 的 80 端口映射回来：

```bash
cd deploy
docker-compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d
```

之后小程序 `development` 环境的 `http://127.0.0.1:80` 即可用。验证：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:80/api/healthz   # 期望 401
```

**该文件不进仓库**（已在 `.gitignore`），且刻意不叫 `docker-compose.override.yml` —— 那个名字会被
`docker-compose up` **自动加载**，一旦误传到生产服务器，web 就会在公网暴露 80 端口，绕过 TLS。
名字不同 + 忽略规则，两层保险。

### 为什么后端会 502（本地高发，务必知道）

nginx 的 `proxy_pass http://app:3001` 是**启动时解析一次并永久缓存**的。`app` 容器一重启换 IP
（例如被 `docker restart` 或重新 `up`），nginx 仍往旧 IP 打，客户端拿到 **502 且没有任何提示**。

`deploy/nginx.conf` 已用 `resolver 127.0.0.11` + 变量写法改为**请求时解析**，改后 app 换 IP 无需重启 web。
如果你改了 nginx 配置，**必须重建 web 镜像**才生效（配置是 COPY 进镜像的，不是挂载）：

```bash
docker-compose -f docker-compose.prod.yml build web
```

## 五、首次部署（全新机器）

```bash
# 1. 加 swap（2C4G 上很重要，否则内存吃紧时 OOM killer 会先杀 mysql）
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10

# 2. 上传 deploy/ 目录与证书，私钥设 600
chmod 600 /root/family-ledger/deploy/certs/*.key

# 3. 确认 build context 占位目录存在（compose v1 在解析期会校验）
mkdir -p /root/family-ledger/backend /root/family-ledger/agent

# 4. 写 .env（见上一节）

# 5. 搬运镜像（见第五节第 2 步），然后启动
cd /root/family-ledger/deploy
docker-compose -f docker-compose.prod.yml up -d
```

**不要在服务器上构建镜像**：vite 构建峰值 1~2GB、Maven 编译 1GB+，2C4G 上三个镜像一起构建极易 OOM。镜像一律在本地构建后搬运。

## 六、日常更新部署（★ 历史数据怎么办）

### 三条铁律

1. **数据卷 `deploy_mysql-data` 保存全部生产数据，任何情况下都不要删。**
   禁止 `docker-compose down -v`、禁止 `docker volume rm`、禁止 `docker volume prune`。
   （普通的 `down`、`stop`、`up -d` 都不会动卷，是安全的。）

2. **数据库结构变更由后端启动时自动执行**：`app` 启动会跑 `Migrator` + `backend/src/main/resources/db/migration/V*.sql`，只执行未应用过的版本。

3. **⚠️ 已经应用过的迁移文件绝不能再修改。** 迁移表里存了校验和，改动会让后端**拒绝启动**。要改结构就新增一个 `V7__xxx.sql`。

### 关键认知：迁移是单向的

系统**没有**迁移回滚脚本（`down`）。所以：

- 备份是回滚的**唯一**手段，更新前必须先备份；
- 新迁移要保证**旧代码也能容忍新结构**（例如只加可空列），万一要临时回退镜像，旧版本代码不至于立刻崩。

### 更新步骤

**第 1 步：在服务器上备份（不可跳过）**

```bash
cd /root/family-ledger
./deploy/backup.sh
# 输出形如 backups/family_ledger_20261011_120000.sql.gz
```

**第 2 步：本地构建并搬运镜像**

```bash
# 本地仓库根目录
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml build app agent web
docker save deploy-app:latest deploy-agent:latest deploy-web:latest | gzip -1 > /tmp/ledger-images.tar.gz
scp /tmp/ledger-images.tar.gz root@115.159.161.178:/root/
```

**第 3 步：服务器上加载并重启**

```bash
ssh root@115.159.161.178
cd /root/family-ledger/deploy
docker load -i /root/ledger-images.tar.gz && rm -f /root/ledger-images.tar.gz
docker-compose -f docker-compose.prod.yml up -d    # 不删卷、不构建
```

也可以用 `deploy/upgrade.sh` 把「备份 + load + 重启 + 健康检查」串起来：

```bash
cd /root/family-ledger
./deploy/upgrade.sh /root/ledger-images.tar.gz
```

**第 4 步：验证**

```bash
cd /root/family-ledger/deploy
docker-compose -f docker-compose.prod.yml ps        # 五个容器都应为 Up
docker logs family-ledger-app 2>&1 | tail -30       # 看迁移是否成功、有无报错
curl -skI --resolve theseven.cc:443:127.0.0.1 https://theseven.cc/healthz   # 应 204
# 再看一眼数据还在不在（确认迁移没把数据搞丢）
DBPW=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
docker exec -e MYSQL_PWD="$DBPW" family-ledger-mysql \
  mysql -uroot -N -e "SELECT COUNT(*) FROM txn;" family_ledger
```

**第 5 步：出问题就回滚**

```bash
cd /root/family-ledger
./deploy/restore.sh backups/family_ledger_<更新前的那个>.sql.gz   # 需输入 yes
# 再把上一版镜像 load 回来，然后 up -d
```

`restore.sh` 会先自动备份当前状态，所以回滚本身也是可回滚的。

## 七、备份与恢复

```bash
./deploy/backup.sh                      # 导出到 backups/，默认保留 14 天
./deploy/restore.sh backups/xxx.sql.gz  # 覆盖现有数据，需输入 yes
```

**建议挂定时任务**（服务器上 `crontab -e` 添加）：

```cron
# 每天凌晨 3:10 备份
10 3 * * * cd /root/family-ledger && ./deploy/backup.sh >> backups/backup.log 2>&1
```

备份目前只在本机 `backups/` 目录，**建议再同步一份到对象存储或另一台机器**（本机磁盘坏掉就全没了）。

## 八、小程序接入（上线前必做）

小程序要连到生产后端，**必须在微信公众平台配置 request 合法域名**。开发者工具里勾了「不校验合法域名」能通，
**不代表真机、体验版、正式版能通** —— 这两个环境的校验是强制的，绕过不了。

| 项 | 值 |
| --- | --- |
| 配置路径 | 微信公众平台 → 开发管理 → 开发设置 → 服务器域名 |
| request 合法域名 | `https://theseven.cc` |
| 前置条件 1 | 域名**已完成 ICP 备案**，且备案主体与小程序主体一致（未备案无法提交，提交了也拦） |
| 前置条件 2 | 证书由受信任 CA 签发且未过期（自签名不行、证书链要完整） |

提交后约 3–5 分钟生效。改完在小程序里**重新进入登录页**再试。

排查顺序与现象对照：

| 现象 | 定位 |
| --- | --- |
| 开发者工具正常、真机/体验版失败 | 90% 是合法域名没配，或域名没备案 |
| 登录页提示「请求域名未配置」 | 客户端已能识别，直接照提示去配 |
| 登录页「当前接口」显示 `http://127.0.0.1:80` | **手上的包是旧构建**。重新上传一版体验版即可（接口地址按版本自动判断） |

## 九、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `https` 打不开、`http` 正常 | 云安全组没放行 **443**（入站 TCP 443 允许）。国内小程序还要求域名已 ICP 备案 |
| `502 Bad Gateway` | 看 `tls` 与 `web` 的日志，确认 `web` 容器在 Up。若来自 `tls`，通常是 `web` 没起来 |
| app 反复重启，日志 `Access denied for user 'root'` | `mysql` 里的密码与 `.env` 不一致。**只在首次部署且确认无历史数据时**才可删卷重建 |
| app 启动报迁移校验和不匹配 | 有人改过已应用的 `V*.sql`。恢复原内容；确实要改就新增迁移 |
| 容器时间不对（凌晨记账日期差一天） | app 需 `TZ=Asia/Shanghai` + `-Duser.timezone=Asia/Shanghai`，compose 里已配 |
| 磁盘被日志吃满 | 各服务已配 `json-file 10m × 3`；若仍满，检查 `docker system df` |
| 小程序体验版登录失败 | 先看第七节。再看 app 日志 `docker logs family-ledger-app`，`WECHAT_LOGIN_FAILED` 时用服务端的 AppID/Secret 直连微信 `jscode2session` 验证凭据 |

## 十、证书

- 位置：`deploy/certs/theseven.cc_bundle.crt` + `.key`（私钥 `chmod 600`）
- 覆盖域名：`theseven.cc`、`www.theseven.cc`
- **有效期到 2027-01-09**，到期后 HTTPS 会整体失效（浏览器与小程序都会报错）

续期步骤（新证书覆盖同名文件后）：

```bash
cd /root/family-ledger/deploy
# 覆盖 certs/ 下的证书与私钥，保持文件名不变
chmod 600 certs/theseven.cc.key
docker-compose -f docker-compose.prod.yml restart tls
```

## 十一、资源与运维

- **内存上限**：mysql/app 各 768m、agent 384m、web/tls 各 64m（合计约 2.1GB）
- **日志上限**：各服务 `json-file`，单文件 10m、保留 3 个
- **swap**：4GB（已写入 `/etc/fstab`，`vm.swappiness=10`）
- **不要改 JVM 的 locale**：现为 en_US，改 zh_CN 可能影响金额格式化
