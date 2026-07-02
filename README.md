# Fitness AI

“体适能 AI 管家”是一个面向大学生创新训练项目的校园健康体适能检测与管理原型系统。

项目围绕手机视频、训练记录和 AI 姿态分析，提供训练记录、视频管理、动作评分和数据统计能力。

## 项目目标

- 用普通手机完成基础体适能动作采集。
- 用计算机视觉提取姿态关键点。
- 用规则化算法评估动作质量并生成反馈。
- 用训练记录和统计数据辅助学生了解长期变化。
- 后续逐步接入可穿戴数据和个性化建议。

## 当前功能

- 用户注册、登录和个人资料管理。
- 训练动作目录和训练记录管理。
- 训练统计、周报和个人最佳记录。
- 视频上传、删除和认证访问。
- MoveNet 姿态分析。
- 动作阶段识别、自动次数统计、动作评分与反馈。
- React Web 前端和 Android 客户端原型。

## 技术栈

- 后端：FastAPI、SQLAlchemy、PostgreSQL。
- AI/视频：MoveNet、OpenCV/TFLite。
- Web：React、TypeScript、Vite。
- Android：Kotlin、Jetpack Compose、CameraX。
- 测试：pytest、Vitest、JUnit。

## 项目结构

```text
.
├── app/                  # FastAPI 后端
├── tests/                # 后端测试
├── scripts/              # 初始化和辅助脚本
├── Fitness-ai-frontend/  # React Web 前端
├── Fitness-ai-android/   # Android 客户端
├── DEV/                  # 本地开发文档
└── requirements.txt      # 后端依赖
```

## 快速启动

### 后端

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python -m scripts.init_db
python -m scripts.seed_data
uvicorn app.main:app --reload
```

接口文档地址：`http://127.0.0.1:8000/docs`

### Web 前端

```powershell
cd Fitness-ai-frontend
npm install
copy .env.example .env
npm run dev
```

### Android

```powershell
cd Fitness-ai-android
.\gradlew.bat assembleDebug
```

Android 模拟器默认连接：`http://10.0.2.2:8000/`。

## 常用测试

```powershell
# 后端
.\venv\Scripts\python.exe -m pytest -q

# Web
cd Fitness-ai-frontend
npm run test

# Android
cd Fitness-ai-android
.\gradlew.bat testDebugUnitTest
```

## 开发说明

- 不提交 `.env`、`venv/`、`logs/`、`uploads/`、`node_modules/`、`build/` 等本地产物。
- 受保护接口使用 Bearer Token。
- 训练记录、视频和 AI 分析接口需要校验用户归属。
- 视频文件通过 `/api/video` 认证访问。
- `DEV/` 下的长期规划和本地开发文档默认不跟踪。
- 后续新功能不再使用 OpenSpec；计划和设计说明直接维护在 `README.md`、`AGENTS.md` 或 `DEV/` 下的普通 Markdown 文档中。

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

## 下一阶段

- 完善俯卧撑错误动作识别。
- 扩展深蹲动作质量检查。
- 增加个性化训练建议。
- 接入 Health Connect 或其他可穿戴健康数据。
- 建立样本视频、人工标注和算法评估材料。
