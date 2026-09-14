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

> 不需要上传 `node_modules/`、`backend/target/`、`server/`（旧 Node 后端）、`.git/`。

可以用 scp / rsync / git，例如：

```bash
# 本地（项目根目录）
rsync -av --exclude node_modules --exclude backend/target --exclude server --exclude .git \
  ./ user@服务器IP:/home/user/family-ledger/
```

## 三、设置数据库密码

强烈建议改掉默认密码（默认 root123456）：

```bash
cd /home/user/family-ledger
# 方式一：写进 .env（deploy 目录下，compose 自动读取）
echo "DB_PASSWORD=你的强密码" > deploy/.env
```

## 四、一键启动

```bash
cd /home/user/family-ledger
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

首次会拉取基础镜像 + 构建前端/后端 + 下载依赖，视网络约 3~10 分钟。
完成后：

```bash
docker compose -f deploy/docker-compose.prod.yml ps   # 三个容器都 Up 即成功
curl http://服务器IP/api/family                          # 应返回 {"id":1,"name":"我的家"}
```

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

> 注意：数据库在卷 `mysql-data` 里，`docker compose down` 不会丢数据；**`down -v` 会删卷，不要随便加 `-v`**。

### 查看已应用的迁移

```bash
docker compose -f deploy/docker-compose.prod.yml exec mysql   mysql -uroot -p"$DB_PASSWORD" -e "SELECT version,name,applied_at FROM family_ledger.schema_migration ORDER BY version;"
```

> 提示：zip 包不保留可执行权限，服务器上首次使用前先执行一次
> `chmod +x deploy/*.sh`；或者直接用 `bash deploy/backup.sh` 调用。
