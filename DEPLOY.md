# 部署指南

## 服务器信息

| 服务 | 地址 | 内部端口 |
|------|------|---------|
| 后端 API | https://api-fitness.waterhill.cyou | 127.0.0.1:18100 |
| 数据库 | 内部 | 127.0.0.1:5432 |

## 前置条件

服务器需要安装：
- Docker 20.10+
- Docker Compose v2
- Git
- Nginx（宝塔已配置反向代理）

## 首次部署

```bash
# 1. 克隆仓库
git clone https://github.com/Acidmoon/Fitness-ai.git
cd Fitness-ai

# 2. 创建生产环境配置（基于模板修改）
cp .env.production.example .env.production
# 编辑 .env.production，填入真实的 SECRET_KEY 和数据库密码

# 3. 构建、迁移并启动
chmod +x deploy.sh
./deploy.sh

# 4. （可选）填充示例数据
./deploy.sh db-seed
```

## 日常更新（最常用）

当你在本地开发完成并 push 到 GitHub 后，SSH 到服务器执行：

```bash
cd /path/to/Fitness-ai
./deploy.sh
```

这一条命令会：
1. `git pull` 拉取最新代码
2. `docker compose build` 重新构建镜像
3. 保持旧后端运行，启动数据库并执行迁移前检查
4. 对已有数据库执行 `pg_dump` 备份
5. 执行 `alembic upgrade head`
6. 启动更新后的容器并执行健康检查

姿态分析推理跑在后端进程内，所以 `docker compose build` 后的容器切换会中断在跑任务。
遗留的 `queued`/`running` 任务会在启动对账时标为 `failed`（错误文案提示重新发起分析），
记录不会被死任务锁住；客户端重新提交一次即可。若将来改成多 worker 共库，
必须把 `POSE_ANALYSIS_JOB_RECLAIM_ON_STARTUP` 设为 `false`，只依赖超时对账。

## 首次接管历史数据库

2026 年 7 月 10 日之前由 `scripts.init_db` 创建的数据库没有
`alembic_version` 表。第一次部署包含 Alembic 的版本时，默认更新会主动停止，
避免误把历史数据库当作空库重新建表。

先确认旧版本后端仍在运行，然后执行：

```bash
cd /path/to/Fitness-ai
./deploy.sh db-baseline
./deploy.sh db-migrate
./deploy.sh
```

`db-baseline` 会先生成数据库备份，再执行
`alembic stamp 20260710_0000`。该命令只用于已经存在 `users`、`records`
等历史表的数据库；全新空库不需要 stamp。

本次迁移只增加向后兼容列、回填来源字段、修复级联外键并建立活动任务唯一索引。
旧后端可以在迁移期间继续读取原字段；主要影响是短暂的 DDL 表锁，持续时间取决于
`records` 和 `pose_analysis_jobs` 的数据量。

## 常用命令

```bash
# 查看服务状态
./deploy.sh status

# 查看实时日志
./deploy.sh logs           # 所有服务
./deploy.sh logs backend   # 仅后端

# 重启服务（不重新构建）
./deploy.sh restart

# 停止服务
./deploy.sh stop

# 初始化/重置数据库
./deploy.sh db-migrate

# 首次接管历史数据库（只执行一次）
./deploy.sh db-baseline
```

## 仅更新后端

如果只改了 Python 代码：

```bash
git pull origin main
docker compose build backend
./deploy.sh db-migrate
docker compose --env-file .env.production up -d backend
```

## 启用 AI 姿态分析

镜像已经内置 MoveNet Lightning **float16** 模型（`/app/models/movenet_lightning.tflite`）。
运行时不解 int8 量化输出，否则会静默产出错误关键点，因此现在遇到 int8 模型会直接报 503。

`.env.production` 需要：

```bash
POSE_ANALYSIS_BACKEND=movenet
MOVENET_ENABLED=true
MOVENET_MODEL_PATH=/app/models/movenet_lightning.tflite
MOVENET_MODEL_VARIANT=lightning
```

验证模型可用（不写数据库，只解权重并跑一帧）：

```bash
docker compose exec backend python - <<'PY'
import numpy as np
from app.services.pose_analysis_runtime import MoveNetRuntime
print(MoveNetRuntime().analyze_frame(np.zeros((480, 640, 3), dtype=np.uint8))["model"])
PY
```

输出包含 `{'backend': 'movenet', 'name': 'lightning', 'input_size': 192}` 即说明姿态分析已就绪；
报 `PoseAnalysisUnavailable` 则按错误文案检查 `MOVENET_ENABLED`、模型路径和模型精度。

动作目录 seed 依赖仓库里的 `data/external/exercises-dataset/exercises.json`，该目录已打进镜像：

```bash
./deploy.sh db-seed
```

## 环境变量说明

`.env.production` 中的关键配置：

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://fitness:xxx@db:5432/fitness_ai` |
| `SECRET_KEY` | JWT 签名密钥（必须修改） | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ALLOWED_ORIGINS` | CORS 允许的前端域名 | `https://fitness.waterhill.cyou` |
| `MOVENET_ENABLED` | 是否启用姿态分析 | `true`（镜像已内置 float16 模型） |
| `MOVENET_MODEL_PATH` | 容器内模型路径 | `/app/models/movenet_lightning.tflite` |
| `POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS` | 活动任务超时回收阈值，默认 1800 | `1800` |
| `POSE_ANALYSIS_JOB_RECLAIM_ON_STARTUP` | 启动时立即回收遗留任务（仅单进程拓扑） | `true` |

## 数据备份

```bash
# 备份数据库
docker compose exec db pg_dump -U fitness fitness_ai > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260520.sql | docker compose exec -T db psql -U fitness fitness_ai
```

## 故障排查

```bash
# 容器没起来
docker compose ps
docker compose logs backend --tail=50

# 后端 500 错误
./deploy.sh logs backend

# 数据库连接失败
docker compose exec backend python -c "from app.database import engine; print(engine.url)"

# 重新构建所有容器
docker compose --env-file .env.production build --no-cache
docker compose --env-file .env.production up -d
```
