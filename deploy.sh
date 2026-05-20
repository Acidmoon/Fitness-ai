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

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

case "${1:-update}" in
  update|"")
    log "拉取最新代码..."
    git pull origin main

    log "构建并启动服务..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME build --no-cache
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d

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

    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
    log "部署完成！"
    ;;

  restart)
    log "重启服务..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME restart
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
    ;;

  stop)
    log "停止服务..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME down
    ;;

  logs)
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f --tail=50 ${2:-}
    ;;

  status)
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
    echo ""
    log "后端健康检查:"
    curl -s http://127.0.0.1:18100/health || echo "未响应"
    echo ""
    ;;

  db-init)
    log "初始化数据库表..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME exec backend python -m scripts.init_db
    ;;

  db-seed)
    log "填充示例数据..."
    docker compose -f $COMPOSE_FILE -p $PROJECT_NAME exec backend python -m scripts.seed_data
    ;;

  *)
    echo "用法: $0 {update|restart|stop|logs|status|db-init|db-seed}"
    echo ""
    echo "  update   - 拉取代码并重新构建部署（默认）"
    echo "  restart  - 重启所有容器"
    echo "  stop     - 停止所有容器"
    echo "  logs     - 查看实时日志（可选服务名：backend/frontend/db）"
    echo "  status   - 查看容器状态和健康检查"
    echo "  db-init  - 初始化数据库表"
    echo "  db-seed  - 填充示例数据"
    exit 1
    ;;
esac
