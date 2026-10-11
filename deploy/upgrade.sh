#!/usr/bin/env bash
# 生产更新部署：备份 → 加载镜像 → 重启 → 健康检查。
#
# 铁律：本脚本只做 up -d，绝不删除数据卷（不碰 down -v / volume rm / prune）。
#
# 用法（在项目根目录执行）：
#   ./deploy/upgrade.sh /root/ledger-images.tar.gz
#
# 可选环境变量：
#   SKIP_BACKUP=1   跳过备份（不推荐，仅在你已确认有可用备份时用）
#   COMPOSE_FILE    默认 deploy/docker-compose.prod.yml
#
# 回滚：见脚本末尾提示。

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE=${COMPOSE_FILE:-deploy/docker-compose.prod.yml}

# 兼容 docker compose v2 与 docker-compose v1
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
elif [ -x /usr/local/bin/docker-compose ]; then
  DC="/usr/local/bin/docker-compose"
else
  echo "错误：未找到 docker compose / docker-compose" >&2
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "用法: ./deploy/upgrade.sh <镜像包.tar.gz>"
  exit 1
fi
BUNDLE="$1"
[ -f "$BUNDLE" ] || { echo "镜像包不存在: $BUNDLE"; exit 1; }

echo "==> 0/5 更新前状态"
$DC -f "$COMPOSE_FILE" ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || $DC -f "$COMPOSE_FILE" ps

echo "==> 1/5 备份数据库（这是迁移出问题时唯一的回滚手段）"
if [ "${SKIP_BACKUP:-0}" = "1" ]; then
  echo "    已按 SKIP_BACKUP=1 跳过备份，请确认你确实有可用备份"
else
  ./deploy/backup.sh
fi

echo "==> 2/5 记录当前镜像 ID（回滚时要 load 回这一版）"
SNAP="backups/images_before_$(date +%Y%m%d_%H%M%S).txt"
{
  echo "# 更新前镜像快照 $(date '+%F %T')"
  docker images --format '{{.Repository}}:{{.Tag}}  {{.ID}}  ({{.CreatedSince}})' | grep -E '^deploy-' || true
} | tee "$SNAP"

echo "==> 3/5 加载新镜像"
docker load -i "$BUNDLE"
rm -f "$BUNDLE"

echo "==> 4/5 重启服务（只 up -d，数据卷保持不动）"
$DC -f "$COMPOSE_FILE" up -d

echo "==> 5/5 等待就绪并健康检查"
sleep 25
$DC -f "$COMPOSE_FILE" ps
echo ""
echo "--- app 启动与迁移日志（末尾 15 行，重点看有没有迁移报错）---"
docker logs family-ledger-app 2>&1 | tail -15
echo ""
echo "--- 健康检查（从本机直连，绕过安全组）---"
if curl -skI --max-time 10 --resolve theseven.cc:443:127.0.0.1 https://theseven.cc/healthz | head -1 | grep -q "204"; then
  echo "    ✅ /healthz 返回 204"
else
  echo "    ⚠️  健康检查未通过，请查看上面的 app 日志"
fi

echo ""
echo "==> 完成。若发现异常，回滚步骤："
echo "    1) 恢复数据： ./deploy/restore.sh backups/<更新前的备份>.sql.gz"
echo "    2) 改回旧镜像：对照 $SNAP 里的镜像 ID，重新 load 上一版镜像包后执行"
echo "       $DC -f $COMPOSE_FILE up -d"
echo "    注意：迁移不可逆，只回退镜像可能不够，通常需要同时恢复备份。"
