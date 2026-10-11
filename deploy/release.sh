#!/usr/bin/env bash
# 本地发布：构建三个业务镜像 → 打包 → 传到生产服务器。
# 镜像一律在本地构建，不要在 2C4G 服务器上构建（vite/Maven 构建峰值 1~2GB，会 OOM）。
#
# 用法（本地仓库根目录执行）：
#   ./deploy/release.sh
#   SERVER=root@1.2.3.4 ./deploy/release.sh
#
# 传完之后，到服务器上执行：
#   cd /root/family-ledger && ./deploy/upgrade.sh /root/ledger-images.tar.gz

set -euo pipefail
cd "$(dirname "$0")/.."

SERVER=${SERVER:-root@115.159.161.178}
BUNDLE=${BUNDLE:-/tmp/ledger-images.tar.gz}
COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-deploy/.env}

echo "==> 1/3 构建镜像（app / agent / web）"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build app agent web

echo "==> 2/3 打包（docker save | gzip）"
docker save deploy-app:latest deploy-agent:latest deploy-web:latest | gzip -1 > "$BUNDLE"
ls -lh "$BUNDLE"

echo "==> 3/3 传输到 $SERVER（走 scp，不经过聊天/日志）"
scp "$BUNDLE" "$SERVER:/root/"

echo ""
echo "==> 本地部分完成。接着在服务器上执行："
echo "    ssh $SERVER"
echo "    cd /root/family-ledger && ./deploy/upgrade.sh /root/$(basename "$BUNDLE")"
