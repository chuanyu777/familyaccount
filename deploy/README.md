# 云服务器部署指南

把「家庭记账簿」打包部署到一台 Linux 云服务器，前端（Vue）、后端（Java/Spring Boot）、数据库（MySQL）三个服务用 Docker Compose 一键拉起，对外只暴露 80 端口（Nginx）。

## 部署架构

```
浏览器 ──> Nginx(web容器, 80) ──/api反代──> Spring Boot(app容器, 3001) ──JDBC──> MySQL(mysql容器, 3306)
             │ 托管前端静态文件
             └── web/dist (Vue 构建产物)
```

## 服务器要求
- 任意 Linux（Ubuntu 20.04+ / Debian / CentOS 7+ 均可）
- 已安装 Docker 和 Docker Compose（`docker compose version` 能出即可）
- 内存建议 ≥ 2GB（三个容器 + MySQL 缓冲）

## 一、安装 Docker（若已装跳过）

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
# 让当前用户免 sudo 用 docker（可选）
sudo usermod -aG docker $USER && newgrp docker
```

## 二、上传代码

把项目里这些内容上传到服务器（例如 `/home/user/family-ledger/`）：

- `backend/`        （后端源码，构建时在容器内用 Maven 打包）
- `web/`            （前端源码）
- `deploy/`         （生产 compose + nginx 配置 + 前端 Dockerfile）
- `package.json`、`package-lock.json`、`tsconfig.json`
- `.dockerignore`

> 不需要上传 `node_modules/`、`backend/target/`、`.git/`。
> 注：原 Node 后端 `server/` 已整体移除，访问控制与全部业务接口都由 Spring Boot 提供。

可以用 scp / rsync / git，例如：

```bash
# 本地（项目根目录）
rsync -av --exclude node_modules --exclude backend/target --exclude .git \
  ./ user@服务器IP:/home/user/family-ledger/
```

## 三、设置数据库密码与家庭访问口令

强烈建议改掉默认密码（默认 root123456），并设置家庭访问口令：

```bash
cd /home/user/family-ledger
# compose v2 读 deploy/.env；v1 只读项目根目录 .env，两个位置都写一份最稳妥
cat >> deploy/.env <<'EOF'
DB_PASSWORD=你的强密码
FAMILY_ACCESS_CODE=你的家庭访问口令
SESSION_SECRET=随机长字符串（建议 48 位以上）
EOF
```

`app` 服务以 `SPRING_PROFILES_ACTIVE=prod` 启动：缺 `FAMILY_ACCESS_CODE` 或 `SESSION_SECRET`
时进程**拒绝启动**（fail-fast），避免部署出一个没有门禁的账本。

- `FAMILY_ACCESS_CODE`：全家人共用的唯一口令，只在环境变量里，不入库、不进浏览器。
- `SESSION_SECRET`：会话签名密钥；**轮换它会让所有已解锁设备立即失效**，用于「一键踢掉全部设备」。
- `TRUST_PROXY_HOPS`：已在 compose 里设为 `1`（单层 Nginx）。若改成多层代理，需同步调整为层数，
  否则限流会把所有请求算成同一个地址。
- 可信设备有效期 30 天；Cookie 为 `Path=/; HttpOnly; SameSite=Strict`，
  是否追加 `Secure` 由**请求是否真的走 HTTPS** 决定（看 `X-Forwarded-Proto`），不是由环境决定——
  这样纯 HTTP 源站也能正常解锁（否则浏览器会拒收带 Secure 的 Cookie）。上了 HTTPS 就自动带上。

## 四、一键启动

```bash
cd /home/user/family-ledger
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### 本地 HTTP 试跑

和线上用同一条命令即可，不需要额外的覆盖文件：

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

`http://localhost` 下 `X-Forwarded-Proto` 是 `http`，会话 Cookie 不会带 `Secure`，浏览器能正常存。
唯一前提：本地 `deploy/.env` 里已经写好 `FAMILY_ACCESS_CODE` 与 `SESSION_SECRET`（prod profile
会在启动时校验，缺了就拒绝启动）。

首次会拉取基础镜像 + 构建前端/后端 + 下载依赖，视网络约 3~10 分钟。
完成后：

```bash
docker compose -f deploy/docker-compose.prod.yml ps   # 三个容器都 Up 即成功
curl -i http://服务器IP/healthz                          # 应返回 204（健康检查公开）
curl -i http://服务器IP/api/family                       # 未解锁应返回 401 ACCESS_REQUIRED
curl -i -c /tmp/family-cookie -H 'Content-Type: application/json' \
  -d '{"code":"你的家庭访问口令"}' http://服务器IP/api/access/unlock   # 204 + Set-Cookie
curl -i -b /tmp/family-cookie http://服务器IP/api/family               # 200 {"id":1,"name":"我的家"}
```

> 当前 Nginx 只做反代，未配置 `auth_request`，所以未解锁时仍可下载前端包，
> 页面加载后接口返回 401 才会跳到 `/unlock.html`。若要「未解锁连页面都拿不到」，
> 见 `docs/superpowers/plans/2026-09-22-household-access-control.md` 的 Task 4。

浏览器访问 `http://服务器IP` 即可使用。

## 五、常用运维命令

```bash
cd /home/user/family-ledger

# 查看日志
docker compose -f deploy/docker-compose.prod.yml logs -f app

# 重启 / 停止
docker compose -f deploy/docker-compose.prod.yml restart
docker compose -f deploy/docker-compose.prod.yml down        # 停止（保留数据）

# 备份数据库（导出 SQL）
docker exec family-ledger-mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" family_ledger' > backup-$(date +%F).sql

# 恢复
docker exec -i family-ledger-mysql mysql -uroot -p密码 family_ledger < backup.sql
```

## 六、更新版本

> **只要线上已有数据，请走第八节的「已有数据的线上升级清单」，不要直接执行下面的命令。**

本地改完代码后，重新上传，再：

```bash
cd /home/user/family-ledger
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

## 七、安全与后续（可选）

1. **开放防火墙**：云厂商安全组放行 80（及 HTTPS 443）端口。
2. **配置 HTTPS + 域名**：推荐用 Nginx 反代容器外的方案，或换用
   `nginx` + certbot。最简单是给云厂商负载均衡/CDN 挂证书，源站保持 80。
3. **定期备份**：MySQL 数据在 Docker 卷 `mysql-data` 里，配合上面的 mysqldump 定时任务。
4. **别把 3306 暴露公网**：compose 里 mysql 未映射端口，仅内网可达，默认已安全。

## 常见问题

- **`api` 请求 502**：多半是 app 容器还没起好（等 MySQL healthy）。看日志
  `docker compose -f deploy/docker-compose.prod.yml logs app`。
- **首次构建超时**：网络慢，重试 `up -d --build`，Docker 会复用已下载的层。
- **端口 80 被占**：改 compose 里 `"80:80"` 为 `"8080:80"`，用 `http://IP:8080` 访问。

## 八、日常维护：备份 / 恢复 / 数据库迁移

### 备份（建议每天自动跑一次）

```bash
cd /home/lighthouse/app
./deploy/backup.sh                 # 生成 backups/family_ledger_时间戳.sql.gz，默认保留 14 天

# 挂到 crontab：每天凌晨 3 点
(crontab -l 2>/dev/null; echo "0 3 * * * cd /home/lighthouse/app && ./deploy/backup.sh >> backups/backup.log 2>&1") | crontab -
```

### 恢复（会覆盖现有数据，脚本会先自动再备份一次当前状态）

```bash
./deploy/restore.sh backups/family_ledger_20260914_030000.sql.gz
```

### 数据库结构 / 历史数据变更

后端内置版本化迁移器，**每次启动自动执行未应用的脚本**，不用手工连数据库跑 SQL。完整规则见 `backend/MIGRATIONS.md`，要点：

1. 在 `backend/src/main/resources/db/migration/` 新增 `V{版本号}__{简述}.sql`（版本号递增）；
2. `V1__baseline.sql` 是空的基线锚点，不要改；已应用过的脚本也不许改（启动会报校验和错误）；
3. 加字段允许为空/给默认值 → 保证老代码可读；删字段分两次发布（先加新列并双写，稳定后再删旧列）；
4. 脚本要 MySQL 与 H2 都能跑（本地 `mvn test` 会用 H2 真跑一遍）；
5. 发布前先 `./deploy/backup.sh`，再 `up -d --build`。

### 安全升级流程（推荐顺序）

```bash
./deploy/backup.sh                                          # 1 备份
# 2 上传/更新代码
docker compose -f deploy/docker-compose.prod.yml up -d --build   # 3 重建启动（自动执行迁移）
docker compose -f deploy/docker-compose.prod.yml logs -f app     # 4 看日志，确认出现 [migrate] 且无报错
curl http://localhost/api/family                            # 5 冒烟
```

### ⭐ 已有数据的线上升级清单（本次版本）

本次发布 = **前端清理 + 后端新增家庭访问控制**，**没有任何表结构变更**（`backend/src/main/resources/schema.sql`
与 `db/migration/` 都没动，`V1`/`V2` 的校验和不变），因此老数据不会被改写，迁移器启动后也只是空转一遍。
按以下顺序做即可：

1. **先备份**（不可跳过）：`./deploy/backup.sh`，确认 `backups/` 下生成了 `.sql.gz`。
2. **补两个环境变量**（否则 compose 会直接拒绝启动，这是有意为之的 fail-fast）：

   ```bash
   # 项目根目录 .env（compose v1/v2 都读得到，最稳妥）
   cat >> .env <<'EOF'
   FAMILY_ACCESS_CODE=你的家庭访问口令
   SESSION_SECRET=随机长字符串（建议 48 位以上）
   EOF
   cp .env deploy/.env      # compose v2 从 deploy/ 读，再放一份
   ```

3. **确认 HTTPS 情况**（决定 Cookie 行为，最容易踩的坑）：
   - 站点走 **HTTPS**：保持默认 `SPRING_PROFILES_ACTIVE=prod`，会话 Cookie 带 `Secure`，正常。
   - 站点仍是 **纯 HTTP**：必须保证 `X-Forwarded-Proto` 为 `http`（本仓库 nginx 已按 `$scheme` 转发）；
     此时 Cookie 不会带 `Secure`，可正常解锁。
     若你不打算上 HTTPS，也可以在 `.env` 里写 `SPRING_PROFILES_ACTIVE=` 关掉 prod profile ——
     门禁照样生效，只是不做启动时的密钥校验。**口令在 HTTP 下是明文传输的，仍建议尽快上 HTTPS。**
4. **重建并启动**：`docker compose -f deploy/docker-compose.prod.yml up -d --build`
   （只重建 web 与 app；`mysql-data` 卷里的数据不动）。
5. **冒烟**（注意第一条现在是 401，属预期）：

   ```bash
   curl -i http://服务器IP/healthz                          # 204
   curl -i http://服务器IP/api/family                       # 401 ACCESS_REQUIRED（未解锁）
   curl -i -c /tmp/c -H 'Content-Type: application/json' \
     -d '{"code":"你的口令"}' http://服务器IP/api/access/unlock    # 204 + Set-Cookie
   curl -i -b /tmp/c http://服务器IP/api/family                    # 200，且能看到原有家庭数据
   ```

   最后一条**必须能看到你原来的家庭名/账目**，这是「老数据没丢」的判定点。
   核对数据量：`docker compose ... exec mysql mysql -uroot -p"$DB_PASSWORD" family_ledger -e "SELECT (SELECT COUNT(*) FROM txn) txn, (SELECT COUNT(*) FROM account) acct;"`

6. **告知家人口令**：所有人首次访问都会跳 `/unlock.html`，输入口令后该设备 30 天免密。

**回滚**（出问题 30 秒内可退）：本次没有结构变更，回滚不会动数据。

```bash
# 只想临时关掉门禁：在 .env 里删掉 FAMILY_ACCESS_CODE，或设 SPRING_PROFILES_ACTIVE=
docker compose -f deploy/docker-compose.prod.yml up -d app
# 整体回退版本：恢复上一版代码后 up -d --build，数据卷不动
```

> 注意：数据库在卷 `mysql-data` 里，`docker compose down` 不会丢数据；**`down -v` 会删卷，不要随便加 `-v`**。

### 查看已应用的迁移

```bash
docker compose -f deploy/docker-compose.prod.yml exec mysql   mysql -uroot -p"$DB_PASSWORD" -e "SELECT version,name,applied_at FROM family_ledger.schema_migration ORDER BY version;"
```

> 提示：zip 包不保留可执行权限，服务器上首次使用前先执行一次
> `chmod +x deploy/*.sh`；或者直接用 `bash deploy/backup.sh` 调用。
### 服务器环境注意（CentOS 7 / Docker 20.10 这类老环境）

- 只有 `docker-compose` v1（带横杠）时，命令要写成：
  `sudo /usr/local/bin/docker-compose -f deploy/docker-compose.prod.yml up -d --build`
- **v1 只从"运行目录"读 `.env`**，所以 `DB_PASSWORD` 要写在项目根目录 `/home/lighthouse/app/.env`，
  而不是 `deploy/.env`（两个位置脚本都会读，但 compose 本身只认根目录那一份）。
- backup.sh / restore.sh 已自动兼容 v1 与 v2，无需手动切换。
- 脚本必须是 LF 换行（Windows 编辑后请用 `sed -i 's/\r$//'` 处理），否则会报
  `/usr/bin/env: bash : No such file or directory`。

#### ⚠️ 从 Windows 打包上传：CRLF 会打挂后端（已实际踩过）

Windows 上 `core.autocrlf=true` 时，`git archive` / `git clone` 非交互导出的文件可能是 **CRLF**。
`db/migration/V*.sql` 的字节一变，迁移器的 MD5 校验和就与线上 `schema_migration` 记录不符，
后端会抛 `IllegalStateException: 迁移脚本已被修改，拒绝启动`，容器**无限重启**、接口全挂。

打包命令（显式关掉 autocrlf，最稳）：

```bash
git -c core.autocrlf=false archive --format=tar.gz -o family-ledger.tar.gz v1.0
```

上传后用这条自检，**含 CR 的文件数必须是 0**：

```bash
mkdir -p /tmp/chk && tar -xzf family-ledger.tar.gz -C /tmp/chk
grep -rlUP '\r' /tmp/chk | wc -l          # 必须是 0
md5sum /tmp/chk/backend/src/main/resources/db/migration/V1__baseline.sql
# 应与线上库一致：2bbeed0c6893e7c4e5370a67fcd36e33（449 字节）
```

仓库根的 `.gitattributes` 已加 `* text=auto eol=lf`，正常情况下不会再复现；
上面这条自检留着，改动迁移脚本时值得跑一遍。
