#!/usr/bin/env bash
# 备份 MySQL 数据库（导出 SQL 并压缩，自动清理旧备份）
#
# 用法（务必在「项目根目录」执行）：
#   ./deploy/backup.sh
#
# 可选环境变量：
#   KEEP_DAYS=14        备份保留天数，默认 14
#   BACKUP_DIR=backups  备份目录，默认 ./backups
#
# 建议：把它挂到 crontab，每天凌晨 3 点跑一次
#   0 3 * * * cd /home/lighthouse/app && ./deploy/backup.sh >> backups/backup.log 2>&1

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.prod.yml}
KEEP_DAYS=${KEEP_DAYS:-14}
BACKUP_DIR=${BACKUP_DIR:-backups}

if [ -f deploy/.env ]; then
  set -a; . deploy/.env; set +a
fi
DB_PASSWORD=${DB_PASSWORD:-root123456}

mkdir -p "$BACKUP_DIR"
TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/family_ledger_$TS.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T -e MYSQL_PWD="$DB_PASSWORD" mysql \
  mysqldump -uroot --single-transaction --quick --default-character-set=utf8mb4 \
    family_ledger | gzip > "$OUT"

echo "备份完成: $OUT （$(du -h "$OUT" | cut -f1)）"

# 清理过期备份
find "$BACKUP_DIR" -name 'family_ledger_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "已清理 $KEEP_DAYS 天前的旧备份"
