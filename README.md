# Fitness AI

“体适能 AI 管家”是一个面向大学生创新训练项目的校园健康体适能检测与管理原型系统。

项目围绕手机视频、训练记录和 AI 姿态分析，提供训练记录、视频管理、动作评分和数据统计能力。

## 项目目标

- 用普通手机完成基础体适能动作采集。
- 用计算机视觉提取姿态关键点。
- 用规则化算法评估动作质量并生成反馈。
- 用训练记录和统计数据辅助学生了解长期变化。
- 后续逐步接入可穿戴数据和个性化建议。

本仓库只实现后端；Web 前端和 Android 客户端由独立仓库维护。

## 当前功能

- 用户注册、登录和个人资料管理。
- 训练动作目录和训练记录管理。
- 训练统计、周报和个人最佳记录。
- 视频上传、删除和认证访问。
- MoveNet 姿态分析。
- 动作阶段识别、自动次数统计、动作评分与反馈。

## 技术栈

- 后端：FastAPI、SQLAlchemy、PostgreSQL。
- AI/视频：MoveNet、OpenCV/TFLite。
- 测试：pytest。

## 项目结构

```text
.
├── app/                  # FastAPI 后端
├── alembic/              # 数据库版本迁移
├── docs/                 # 跟踪的耐久设计文档与 API 契约
├── tests/                # 后端测试
├── scripts/              # 初始化和辅助脚本
├── DEV/                  # 本地开发草稿与无人值守 Loop 状态（不跟踪）
└── requirements.txt      # 后端依赖
```

## 快速启动

### 后端

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python -m scripts.seed_data
uvicorn app.main:app --reload
```

接口文档地址：`http://127.0.0.1:8000/docs`

机器可读契约：`docs/openapi.json`（由 `python -m scripts.export_openapi --output docs/openapi.json` 生成）；
`/api/ai` 的状态机、轮询与错误码语义见 `docs/AI-姿态分析接口.md`。

本地要跑通姿态分析，需额外安装可选推理依赖：`pip install -r requirements-movenet.example.txt`，再自行安装一个兼容当前 Python 的 TFLite 解释器（`tflite-runtime`、`tensorflow` 或 `ai-edge-litert`），并把 `.env` 中 `MOVENET_ENABLED=true`、`MOVENET_MODEL_PATH` 指向本地 float16 模型。服务器镜像已内置该模型，无需本地步骤。

## 常用测试

```powershell
.\venv\Scripts\python.exe -m pytest -q
```

## 开发说明

- 不提交 `.env`、`venv/`、`logs/`、`uploads/`、`node_modules/`、`build/` 等本地产物。
- 受保护接口使用 Bearer Token。
- 训练记录、视频和 AI 分析接口需要校验用户归属。
- 视频文件通过 `/api/video` 认证访问。
- 数据库结构只能通过 Alembic 迁移升级；不要再用 `scripts.init_db` 更新已有数据库。
- 耐久文档（设计契约、评分体系、错误识别、路线图、`docs/openapi.json`）维护在跟踪的 `docs/` 下，协作者和 CI 可见；`DEV/` 只做本地草稿与无人值守 Loop 状态，默认不跟踪。
- 改动端点或请求/响应模型后必须重新生成契约产物：`python -m scripts.export_openapi --output docs/openapi.json`，`tests/test_openapi_artifact.py` 会拦住过期产物。
- 后续新功能不再使用 OpenSpec；计划和设计说明直接维护在 `README.md`、`AGENTS.md` 或 `docs/` 下的普通 Markdown 文档中。

## 动作分析模块化架构

后端动作分析按“视频推理、姿态特征、动作规则、次数统计、评分编排”分层，避免新增动作时继续堆叠到单个评分函数中。

```text
app/api/ai.py
  -> app/services/pose_analysis_service.py
  -> app/services/video_pose_analysis.py
  -> app/services/pose_features.py
  -> app/services/exercise_rules/<action>.py
  -> app/services/exercise_rules/repetition_counter.py
  -> app/services/exercise_pose_scoring.py
```

新增周期型动作时，优先在 `app/services/exercise_rules/` 下新增独立规则模块，声明动作别名、所需关键点、关节角组合和阈值，再在 `registry.py` 注册规则。可复用 `pose_features.py` 的角度序列抽取和 `repetition_counter.py` 的 `peak -> valley -> peak` 峰谷次数统计；非周期型动作应在规则模块中输出持续时间、稳定性、漂移和失败原因等证据。

评分响应应持续保留 `auto_count`、`count_source`、`metrics.valid_reps`、`metrics.invalid_reps` 和失败原因，确保自动次数、动作阶段和评分反馈都可解释、可测试、可用于后续评估材料。

## AI 数据一致性

视频、姿态任务和评分结果遵守以下不变量：

- 每次永久上传新视频或删除视频都会递增 `video_revision`。
- 姿态结果只有在 `analysis_revision == video_revision` 时才可读取和评分。
- 异步任务创建时绑定当前 `video_revision`；分析前后都重新校验版本，旧任务不能回写新视频。
- 同一训练记录最多存在一个 `queued` 或 `running` 任务。
- 用户手工录入的 `score`、`count` 分别保存在 `manual_score`、`manual_count`；AI 投影失效后恢复人工值。
- `keypoints_data` 和 `feedback` 是服务端派生字段，创建和普通更新接口拒绝客户端直接写入。
- 删除记录或账户时先提交数据库删除，再尽力清理视频文件，避免数据库继续引用已删除文件。
- 推理在后端进程内执行；服务重启遗留的 `queued`/`running` 任务会在启动对账或客户端轮询时标为 `failed` 并释放记录，超时阈值由 `POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS` 控制，不会出现死任务永久锁住记录。

历史数据库首次采用 Alembic 时，先备份并建立基线，再升级：

```bash
./deploy.sh db-baseline
./deploy.sh db-migrate
```

全新数据库直接执行 `alembic upgrade head` 或 `./deploy.sh db-migrate`。

## 动作目录扩充

项目默认动作目录接入 `hasaneyldrm/exercises-dataset` 的文本数据部分，当前来源 commit 为 `fdb2d48eb7e26f02afbabceea205b114a13e0414`。本仓库只保存 `data/external/exercises-dataset/exercises.json` 和来源说明，不复制上游图片或 GIF 媒体。

Seed 入口仍是：

```powershell
python -m scripts.seed_data
```

该脚本会增量同步 1,324 条外部动作，并保留项目内置的“标准俯卧撑”“标准深蹲”等 AI 展示动作。外部字段会映射到 `Exercise.standard`，用于：

- 动作命名和别名搜索，例如 `push up`、`push-up`、`俯卧撑`。
- 分类、部位、器械、目标肌群和辅助肌群筛选。
- 客户端可消费的多语言动作说明与步骤。
- 校园低器械候选池，例如 `equipment=body weight` 可筛出 325 条外部无器械动作。
- 个性化推荐候选字段，例如 `target_muscles`、`equipment` 和 `body_part`。
- AI 支持路线标记，例如 `analysis_supported`、`canonical_action_key` 和 `analysis_rule_version`。

注意：外部动作说明不是姿态评分标准。AI 评分是否可用仍以 `app/services/exercise_rules/` 注册的规则为准，新增动作必须先补齐阶段、计数、错误动作、阈值和 fixtures 后，才能把 `analysis_supported` 标记为 true。

## 下一阶段

当前路线图与评分、错误识别基线说明维护在 `docs/体适能AI管家-计算机视觉与个性化算法路线图.md`、`docs/标准度评分体系设计.md` 和 `docs/错误动作识别设计.md`（已随仓库跟踪）。要点：

- 完善俯卧撑错误动作识别。
- 扩展深蹲动作质量检查。
- 增加个性化训练建议。
- 接入 Health Connect 或其他可穿戴健康数据。
- 建立样本视频、人工标注和算法评估材料。
