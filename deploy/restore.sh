#!/usr/bin/env bash
# 从备份恢复数据库（会覆盖现有数据！）
#
# 用法（务必在「项目根目录」执行）：
#   ./deploy/restore.sh backups/family_ledger_20260914_030000.sql.gz
#
# 注意：恢复会先停掉后端容器（避免写入冲突），恢复完再启动。

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "用法: ./deploy/restore.sh <备份文件.sql.gz>"
  exit 1
fi

FILE="$1"
[ -f "$FILE" ] || { echo "备份文件不存在: $FILE"; exit 1; }

cd "$(dirname "$0")/.."
COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.prod.yml}

if [ -f deploy/.env ]; then
  set -a; . deploy/.env; set +a
fi
DB_PASSWORD=${DB_PASSWORD:-root123456}

echo "⚠️  即将用 $FILE 覆盖当前数据库，现有数据会被替换！"
read -r -p "确认请输入 yes: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "已取消"; exit 1; }

# 先备份当前状态，万一恢复错了还能救回来
./deploy/backup.sh

echo "停止后端容器..."
docker compose -f "$COMPOSE_FILE" stop app

echo "导入数据..."
gunzip -c "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T -e MYSQL_PWD="$DB_PASSWORD" mysql \
  mysql -uroot --default-character-set=utf8mb4 family_ledger

echo "启动后端容器（会自动执行未应用的迁移脚本）..."
docker compose -f "$COMPOSE_FILE" start app

echo "恢复完成，确认服务状态："
docker compose -f "$COMPOSE_FILE" ps
