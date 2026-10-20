# Fitness AI

基于 Cordis 的全插件化运动评价 MVP，现支持两条入口：

```text
运动记录 JSON → 输入校验 → 评分 → 建议 → JSON 输出
本地视频 → 文件接收 → MoveNet 骨架识别 → 动作分析 → 输入校验 → 评分 → 建议 → JSON 输出
```

运行时只负责插件装载与生命周期。骨架识别、动作分析、评分、建议、文件入口和证据保存分别由插件提供。当前支持 `squat`（深蹲）和 `push-up`（俯卧撑）的视频分析与演示质量评分，运动类型由调用方指定。

另已接入包含 **876 个动作、7 个类别**的完整离线动作库插件。全部条目可查询动作说明、来源和评分能力，支持调用方指定训练目标的完成度评分；其中两项关联现有演示质量规则，其余 874 项明确返回质量标准尚不可用。目录来自社区 [free-exercise-db](https://github.com/yuhonas/free-exercise-db)，不是官方体测评分标准。来源比较、许可与完整接口见 [动作库说明](docs/exercise-library.md)。

## 动作目录与评分标准

```sh
pnpm start exercises manifest
pnpm start exercises list --query squat --limit 10
pnpm start exercises list --category strength --equipment "body only" --muscle quadriceps
pnpm start exercises show Bodyweight_Squat
pnpm start exercises standard squat
pnpm start exercises score-goal examples/exercise-goal.json
```

最后一条输出目标完成度 **80 / 100**，`scoreKind` 为 `goal-completion`，`techniqueScore` 为空。此分数只表示所报告的 8 次占目标 10 次的比例。目标与观测可以使用次、秒或米，同一请求单位相同，由调用方选择适合训练方案的单位；不会把动作目录当成已经支持 876 项视频分析。

其他插件声明 `static inject = ['fitnessExercises']` 后，可调用 `manifest()`、`list(query)`、`get(idOrAlias)`、`getStandard(idOrAlias)` 和 `scoreGoal(value)`。服务契约见 [exercise-contracts.ts](src/exercise-contracts.ts)，跨端请求标准见 [exercise-goal.schema.json](schemas/exercise-goal.schema.json)，完整输入示例见 [exercise-goal.json](examples/exercise-goal.json)。`squat` / `深蹲` 对应 `Bodyweight_Squat`，`push-up` / `俯卧撑` 对应 `Pushups`；不将器械变体自动等同。

目录固定提交和 SHA-256，启动时不联网。上游 5 项缺少步骤、2 项含空步骤，输出分别标记 `missing`、`partial`。原文与缺失状态均保留。媒体权利尚未核实，本次仅保留固定提交的图片引用并标记 `mediaRights: "unverified"`，不打包图片文件。

## 运行 JSON 示例

需要 Node.js **24 或以上**、pnpm **11.7.0**。Cordis 固定为 `4.0.0-rc.11`。

```sh
pnpm install --frozen-lockfile
pnpm demo
pnpm start examples/squat-session.json
pnpm start --help
```

JSON 示例仍输出 **78.81 / 100** 分。直接执行 `node src/main.ts examples/squat-session.json` 可以获得纯 JSON 标准输出。成功退出码为 `0`，失败时标准错误输出包含错误码，退出码为 `1`。

## 用户数据库插件

后端由多个能力插件组合，用户存储通过独立的 PostgreSQL、数据加密、用户管理三个插件提供。支持租户隔离、加密资料与登录身份、状态管理、版本控制、幂等写入、审计、事务 outbox 和在线资料删除；不依赖视频分析插件。

默认不启用用户库。按 [用户数据库部署说明](docs/user-database.md) 配置独立迁移/运行账号、TLS 和密钥，显式迁移、授权及创建租户后，可设置 `FITNESS_USERS_ENABLED=true` 加入应用，也可单独装配 [userDatabasePlugins](src/user-app.ts)。配置字段见 [.env.example](.env.example)，服务契约见 [user-contracts.ts](src/user-contracts.ts)。

```sh
pnpm users:db --help
pnpm users:db migrate
pnpm users:db grant <运行角色>
pnpm users:db key-init
pnpm users:db tenant-create <租户UUID> <名称>
pnpm users:db check
```

迁移步骤使用 `FITNESS_DATABASE_MIGRATION_URL`，普通业务只使用 `FITNESS_DATABASE_URL`。程序不自动加载 `.env`，可由部署系统注入环境或用 `node --env-file=.env src/user-db-main.ts ...`。当前提供可信后端服务接口，HTTP 用户接口和身份认证另由后续插件实现。

## 视频入口

模型已放在 [models/movenet_lightning_fp16.tflite](models/movenet_lightning_fp16.tflite)，接口和指纹见 [模型说明](models/README.md)。原有后端只作为模型和测试环境的来源，识别插件不导入旧后端代码。

Python 依赖见 [python/requirements.txt](python/requirements.txt)。本机已使用 Python 3.13、LiteRT 2.2.0、NumPy 2.4.6、OpenCV Headless 5.0.0.93 完成测试。可使用已有的兼容环境，也可创建独立环境：

```powershell
# 使用 Python 3.13 创建环境；将 python 替换为本机对应解释器也可以
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r python/requirements.txt
$env:FITNESS_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path

pnpm start video "C:\videos\squat.mp4" --exercise squat --target 5 --artifacts artifacts/squat-run-001
pnpm start video "C:\videos\push-up.mp4" --exercise push-up --target 5
```

配置与选项：

- `FITNESS_PYTHON`：执行识别工作者的 Python 可执行文件；未设置时使用 `python`（Windows）或 `python3`。
- `FITNESS_MOVENET_MODEL`：可选模型路径；默认使用项目自带模型。当前适配器要求相同的 Lightning 张量接口。
- `--exercise`、`--target`：必填，分别指定运动类型和目标次数；目标不是人工标注的真实次数。
- `--sample-fps`：默认 10，允许 1–30；动作分析建议使用 10 或以上。低频采样可能无法满足动作连续性要求。
- `--session`：可选会话标识；默认生成 UUID。
- `--artifacts`：可选的**新目录**，保存中间证据，拒绝覆盖同名文件。

文件接收插件当前接收本地路径并校验文件，不复制或修改原视频。网络上传尚未实现；后续上传插件可以把落盘视频作为同一文件契约交给识别插件。

骨架识别通过独立 Python 子进程异步运行，每个任务加载一次模型，默认超时 120 秒，最多同时运行两个任务。插件卸载会终止在途识别并等待进程退出。视频预算为 180 秒、5400 个采样帧、16 兆像素以内；损坏解码和超预算会明确失败，不截断后继续评分。

## 骨架和动作证据

指定 `--artifacts` 后，按阶段保存：

| 文件 | 内容 |
| --- | --- |
| `poses.json` | 每帧 17 个关键点、原视频像素坐标、置信度、帧索引和时间戳，以及旋转、裁剪区域、模型 SHA-256、预处理版本和推理耗时 |
| `motion.json` | 使用的身体侧、有效帧、排除帧、关节角时序、动作周期起止与最低点、规则版本和警告 |
| `workout.json` | 提供给既有评分契约的规范化记录 |
| `assessment.json` | 评分、分项依据和建议 |

无完整周期时，保留前两份证据并返回 `INSUFFICIENT_DATA`。有周期但全部低于评分置信度门槛时，会额外保留运动记录，不生成评分文件。

[vision-contracts.ts](src/vision-contracts.ts) 定义骨架与运动服务契约。骨架使用 `schemaVersion: "1.0"`、`coordinateSpace: "image-pixels"`，x 向右、y 向下，左右指人体自身左右。每帧按 COCO/MoveNet 顺序包含 17 个带名称的关键点，每个点为 `{ name, x, y, confidence }`。

预处理先自动应用视频旋转，再执行人体自适应裁剪和 RGB 补边缩放。首个采样帧细化两次裁剪区域，后续根据上一帧调整；最终坐标全部还原到旋转后的原图像素。落在补边区域的坐标可能超出图像边界，骨架证据保留它们，动作分析排除这些点。时间戳使用解码器 PTS，不通过采样帧编号猜测动作时长。

## 插件结构

[运行时](src/runtime.ts)不引用业务实现，[应用清单](src/app.ts)决定安装哪些插件。[基础契约](src/contracts.ts)和[视觉契约](src/vision-contracts.ts)约定服务、数据、事件和错误。

| 插件 | 提供的能力 | 主要消费方或依赖 |
| --- | --- | --- |
| [PostgresPlugin](src/plugins/postgres.ts) | `fitnessDatabase`：连接池、TLS、事务和生命周期 | 可选用户存储及其他数据库消费方 |
| [UserDataProtectionPlugin](src/plugins/user-data-protection.ts) | `fitnessUserDataProtection`：加密与 HMAC | 可选用户存储 |
| [UserDatabasePlugin](src/plugins/user-database.ts) | `fitnessUsers`：租户内用户、身份、版本、审计与 outbox | 数据库、数据保护服务 |
| [LocalFilePlugin](src/plugins/local-file.ts) | `fitnessFiles`：接收本地视频 | 视频流程 |
| [MoveNetPlugin](src/plugins/movenet.ts) | `fitnessPose`：视频到骨架时序 | 视频流程；Python 工作者 |
| [JointMotionPlugin](src/plugins/joint-motion.ts) | `fitnessMotion`：骨架到动作记录 | 视频流程 |
| [VideoAssessmentPlugin](src/plugins/video-assessment.ts) | `fitnessVideo`：视频评价流程 | 文件、骨架、动作、评分流程、证据服务 |
| [JsonArtifactsPlugin](src/plugins/json-artifacts.ts) | `fitnessArtifacts`：保存中间证据 | 视频流程 |
| [WorkoutInputPlugin](src/plugins/workout-input.ts) | `fitnessInput`：读取和校验运动记录 | 评分流程、命令行 |
| [ExerciseLibraryPlugin](src/plugins/exercise-library.ts) | `fitnessExercises`：876 项目录、逐动作标准、目标完成度评分 | 评分与命令行；可独立装载 |
| [RuleScoringPlugin](src/plugins/rule-scoring.ts) | `fitnessScoring`：动作质量分项评分 | 动作库标准、输入校验、评分流程 |
| [RuleAdvicePlugin](src/plugins/rule-advice.ts) | `fitnessAdvice`：生成建议 | 评分流程 |
| [AssessmentPlugin](src/plugins/assessment.ts) | `fitnessAssessment`：运动记录评价 | 输入、评分和建议服务 |
| [JsonReportPlugin](src/plugins/json-report.ts) | 结果 JSON 输出 | 完成事件 |
| [CliPlugin](src/plugins/cli.ts) | `fitnessCli`：命令行入口 | JSON、视频与动作库能力 |

提供方继承 Cordis `Service` 注册能力，消费方用 `static inject` 声明依赖。插件清单允许先写消费方，Cordis 根据依赖激活。结果分别通过 `fitness/pose-produced`、`fitness/motion-produced`、`fitness/assessment-completed` 和 `fitness/exercise-goal-scored` 广播；事件是同步通知，不存储或补发历史数据。

识别能力可以独立消费：声明依赖 `fitnessFiles`、`fitnessPose`，取得文件后调用 `await ctx.fitnessPose.estimate(file, { sampleFps: 10 })`。替换识别提供方时继续遵守同一骨架契约即可，动作分析不导入 MoveNet 实现。

当前一个作用域中的同名服务只有一个提供方。替换时先卸载旧提供方再加载新提供方；并行比较多个实现可使用 Cordis 隔离作用域。启动时缺少必需依赖会失败；运行中撤销依赖会使消费方暂停，重新提供后恢复。

## 动作分析规则

策略为 `joint-cycle-squat@0.2.0` / `joint-cycle-push-up@0.2.0`。

- 在整段视频中选择总体关键点可靠性较高的一侧，避免逐帧左右切换制造动作。
- 深蹲使用髋—膝—踝角，俯卧撑使用肩—肘—腕角。关键点门槛为 0.3，越界或退化几何不参与分析。
- 对关节角使用最近三帧的中值。深蹲 160°、俯卧撑 155° 作为返回伸展位置的门槛，下降 10° 后进入动作片段。
- 必须返回伸展位置、至少有 30° 角度变化、至少 4 个有效帧、时长 0.5–15 秒。有效帧间隔超过 350ms 会中断，不连接遮挡前后的半次动作。
- 完整往返的浅动作可以作为周期记录，幅度指标较低；周期次数不等于标准合格次数。
- 幅度为片段内角度变化除以 80°，截断至 0–1。
- 深蹲稳定性代理为 `clamp(1 - 躯干倾角标准差 / 45)`；俯卧撑代理为 `clamp(1 - abs(180 - 肩髋踝角) / 90)` 的平均值。
- 每次动作置信度为该片段中所需关键点置信度的平均值，保留原始模型分数尺度。

这些是可替换的二维演示规则，尚未完成规则标定。特别是正面拍摄的膝角、肘角与实际三维关节角可能明显不同；远景、遮挡和多人画面也会影响结果。MoveNet SinglePose 不提供多人身份跟踪、三维骨架或动作类别识别。

## 运动记录与评分契约

JSON 示例见 [examples/squat-session.json](examples/squat-session.json)。必需字段为：

- `schemaVersion: "1.0"`，非空 `sessionId`、`exercise`，均最长 128 字符。
- `targetRepetitions`：1–10000 的整数。
- `repetitions`：1–10000 条记录，每条含 `rangeOfMotion`、`stability`、`confidence`（0–1）和 `durationMs`（1–60000 毫秒）。

评分策略为 `demo-squat-score@0.1.0` / `demo-push-up-score@0.1.0`，建议策略为 `demo-workout-advice@0.1.0`。置信度低于 0.6 的记录不参与评分；全部排除时不产生评分。

| 分项 | 满分 | 分项值 |
| --- | --- | --- |
| 可评估次数完成度 | 20 | `min(可评估次数 / 目标次数, 1)` |
| 动作幅度 | 40 | 可评估动作的幅度平均值 |
| 稳定性 | 25 | 可评估动作的稳定性平均值 |
| 节奏 | 15 | 每条取 `min(durationMs / 2000, 5000 / durationMs, 1)`，再取平均值 |

分项贡献保留两位小数后相加，总分 0–100。建议针对置信度不足、次数不足、幅度、稳定性及节奏生成提示。评分标准和建议均未经过人工真值校准，不代表学校体测标准。

## 验证与批量评估

```sh
pnpm check
```

该命令运行类型检查、73 项 Node.js 测试及 ESM 构建。用户数据库还需单独配置 `FITNESS_TEST_PG_BIN` 后运行 `pnpm test:database`，验证真实 PostgreSQL 约束与备份恢复；不会将未运行的集成检查算作通过。源码使用 Node.js 原生 TypeScript 类型擦除；构建将相对导入转为 `.js`。`Bundler` 类型解析用于兼容 Cordis 当前发布包的声明文件。

```powershell
# 在已安装视觉依赖的 Python 环境下执行六项几何测试
& $env:FITNESS_PYTHON -m unittest discover -s tests -p test_movenet_worker.py -v

# 构建后的入口；models 和 python 目录也需要保留在项目根目录
node dist/main.js video "C:\videos\squat.mp4" --exercise squat --target 5

# 用户测试素材的批量评估；输出目录必须尚不存在
pnpm evaluate:videos "C:\videos" artifacts/evaluation-run-001
& $env:FITNESS_PYTHON scripts/render-pose-evidence.py "C:\videos" artifacts/evaluation-run-001 artifacts/evaluation-run-001/pose-evidence.jpg
```

[素材清单](examples/video-test-set.json)只记录人工查看后的运动类型和演示目标次数，没有逐次人工真值。未列入清单的视频只进行骨架提取，不猜测动作类型。批量结果包含每个视频的状态、周期数、评分、警告和耗时；不能把流程成功率当作识别准确率。

本地运动证据放在忽略版本跟踪的 `artifacts/` 中，现有视频测试见 [MoveNet 验证记录](docs/movenet-validation.md)。用户数据库已作为可选插件实现，部署与验证见 [用户数据库说明](docs/user-database.md)；运动历史入库、网络上传、实时摄像头、手环和前端页面尚未实现。
