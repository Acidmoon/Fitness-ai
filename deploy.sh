#!/bin/bash
# ============================================================
# Fitness AI 一键部署/更新脚本
# 
# 使用方法：
#   首次部署：  ./deploy.sh
#   更新代码：  ./deploy.sh
#   仅重启：    ./deploy.sh restart
#   查看日志：  ./deploy.sh logs
#   查看状态：  ./deploy.sh status
# ============================================================

set -e

COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="fitness-ai"
ENV_FILE=".env.production"
BASELINE_REVISION="20260710_0000"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT_NAME" "$@"
}

wait_for_database() {
  log "等待数据库就绪..."
  for _ in $(seq 1 30); do
    if compose exec -T db sh -c \
      'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  warn "数据库未在 30 秒内就绪"
  return 1
}

database_has_table() {
  local table_name="$1"
  compose exec -T db sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"SELECT to_regclass('public.${table_name}') IS NOT NULL;\"" \
    | tr -d '[:space:]' \
    | grep -qx "t"
}

backup_database() {
  local backup_dir="backups"
  local backup_file="${backup_dir}/fitness_ai_pre_migration_$(date +%Y%m%d_%H%M%S).sql"
  mkdir -p "$backup_dir"
  log "迁移前备份数据库到 ${backup_file}..."
  compose exec -T db sh -c \
    'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$backup_file"
}

run_migrations() {
  if database_has_table "users" && ! database_has_table "alembic_version"; then
    warn "检测到历史数据库但尚未建立 Alembic 基线。"
    warn "请先确认备份后执行：./deploy.sh db-baseline"
    return 1
  fi

  if database_has_table "users"; then
    backup_database
  fi

  log "升级数据库到 Alembic head..."
  compose run --rm backend alembic upgrade head
}

case "${1:-update}" in
  update|"")
    log "拉取最新代码..."
    git pull origin main

    log "构建服务镜像..."
    compose build --no-cache

    # Keep the old backend serving while the backward-compatible migration runs.
    compose up -d db
    wait_for_database
    run_migrations

    log "启动更新后的服务..."
    compose up -d

    log "等待服务就绪..."
    sleep 5

    log "健康检查..."
    if curl -sf http://127.0.0.1:18100/health > /dev/null; then
      log "✅ 后端正常"
    else
      warn "❌ 后端未响应"
    fi

    if curl -sf http://127.0.0.1:18180 > /dev/null; then
      log "✅ 前端正常"
    else
      warn "❌ 前端未响应"
    fi

    compose ps
    log "部署完成！"
    ;;

  restart)
    log "重启服务..."
    compose restart
    compose ps
    ;;

  stop)
    log "停止服务..."
    compose down
    ;;

  logs)
    compose logs -f --tail=50 ${2:-}
    ;;

  status)
    compose ps
    echo ""
    log "后端健康检查:"
    curl -s http://127.0.0.1:18100/health || echo "未响应"
    echo ""
    ;;

  db-init)
    warn "db-init 已由 Alembic 迁移取代，改为执行 db-migrate。"
    compose up -d db
    wait_for_database
    run_migrations
    ;;

  db-baseline)
    compose up -d db
    wait_for_database
    if ! database_has_table "users"; then
      warn "当前数据库为空，无需建立历史基线，请执行 db-migrate。"
      exit 1
    fi
    if database_has_table "alembic_version"; then
      warn "Alembic 基线已存在，不重复 stamp。"
      exit 1
    fi
    backup_database
    log "将现有数据库标记为历史基线 ${BASELINE_REVISION}..."
    compose run --rm backend alembic stamp "$BASELINE_REVISION"
    log "基线已建立，请继续执行：./deploy.sh db-migrate"
    ;;

  db-migrate)
    compose up -d db
    wait_for_database
    run_migrations
    ;;

  db-seed)
    log "填充示例数据..."
    compose exec backend python -m scripts.seed_data
    ;;

  *)
    echo "用法: $0 {update|restart|stop|logs|status|db-init|db-baseline|db-migrate|db-seed}"
    echo ""
    echo "  update   - 拉取代码并重新构建部署（默认）"
    echo "  restart  - 重启所有容器"
    echo "  stop     - 停止所有容器"
    echo "  logs     - 查看实时日志（可选服务名：backend/frontend/db）"
    echo "  status   - 查看容器状态和健康检查"
    echo "  db-init  - 兼容旧命令，等同于 db-migrate"
    echo "  db-baseline - 首次接管历史数据库时建立 Alembic 基线"
    echo "  db-migrate  - 备份并升级数据库到最新版本"
    echo "  db-seed  - 填充示例数据"
    exit 1
    ;;
esac
