# 动作库选择、数据标准与评分边界

研究及导入日期：2026-10-16，Asia/Shanghai。

## 选择结果

当前使用社区项目 [free-exercise-db](https://github.com/yuhonas/free-exercise-db) 的完整文本目录，封装为一个 Cordis `ExerciseLibraryPlugin`，提供 `fitnessExercises` 服务。固定到提交 [`79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142`](https://github.com/yuhonas/free-exercise-db/commit/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142)，实际解析得到 **876 个独立条目**，不是从 README 的“800+”推定数量。

未找到同时满足“覆盖绝大多数锻炼动作、官方权威背书、可自由分发、每项已有机器可执行评分标准”的单一来源。该目录覆盖大量常见力量、器械、自重、拉伸和部分有氧动作，但没有覆盖率分母，不能声称覆盖全部或绝大多数运动。它没有体育组织背书，也不是学校体测标准或临床评价标准。

选择它作为第一版目录，是因为其结构化 JSON 可以固定版本、完整离线使用，且项目对文本数据声明 Unlicense；不以其教学文字推导角度或质量评分阈值。wger 的多语描述和逐条许可适合作为后续单独的来源适配插件，本次未混合两套标识和许可。

| 类别 | 条目数 |
| --- | ---: |
| strength | 584 |
| stretching | 123 |
| plyometrics | 61 |
| powerlifting | 38 |
| olympic weightlifting | 35 |
| strongman | 21 |
| cardio | 14 |

原始文件 [exercises.json](../src/data/free-exercise-db/exercises.json) 原样保留；SHA-256 为 `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`，来源记录见 [manifest.json](../src/data/free-exercise-db/manifest.json)。

## 候选来源与适用范围

下表的“官方”指论文作者或项目维护者提供，不代表行业通用评分认证。

| 来源 | 已核实范围 | 数据与评分的区别 | 复用边界 |
| --- | --- | --- | --- |
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 本次固定版本 876 条 | 动作名称、肌群、器械、难度、英文步骤、图片路径；没有骨架真值或质量评分标注 | [Unlicense 声明](https://github.com/yuhonas/free-exercise-db/blob/79ca7b47d77cd5a6dd7a50440e9f0bf24da6a142/LICENSE.md)；媒体权利存在争议，未打包图片 |
| [wger](https://github.com/wger-project/wger) | [实时 API](https://wger.de/api/v2/exercise/?limit=1) 本次返回 932 个实体；不同语言译文不另计动作 | 社区动作百科与训练管理；没有每个动作的姿态评分阈值 | 代码 AGPL，数据与媒体按条目许可，不能混为一份许可；[项目说明](https://github.com/wger-project/wger#license) |
| [Fitness-AQA / ECCV 2022](https://github.com/ParitoshParmar/Fitness-AQA) | BackSquat、OverheadPress、BarbellRow 三项 | 作者提供专家动作错误标注，适合研究动作质量；不是全部动作的统一 0–100 分规则 | 需要申请数据；研究非商业，转交第三方需许可；[数据许可](https://github.com/ParitoshParmar/Fitness-AQA/blob/main/fitness_aqa_dataset_license.pdf) |
| [Fit3D / AIFit](https://fit3d.imar.ro/fit3d) | 当前数据页 47 个动作、611 次录制、四视角共 2444 对视频与重复分段 | 3D 骨架、人体网格、动作标签和重复区间；论文研究由教练示范学习偏差反馈，不是任意动作固定阈值 | [许可](https://fit3d.imar.ro/legal) 限非商业用途并禁止分发；首页论文摘要的“37+”与当前数据页口径不同 |
| [FLAG3D / CVPR 2023](https://github.com/AndyTang15/FLAG3D) | 60 类、180K 序列，覆盖动捕、渲染和自然场景域 | 3D 姿态、语言教学指令；教学语言不是动作质量分数 | [官方许可](https://andytang15.github.io/FLAG3D/License_FLAG3D.pdf) 限科研且禁止分发，需签署协议 |
| [FineGym / CVPR 2020](https://github.com/SDOlivia/FineGym) | [完整词表](https://sdolivia.github.io/FineGym/resources/dataset/gym530_categories.txt) 530 类竞技体操元素；Gym99/Gym288 是子集 | 是竞技体操动作、子动作和时间分段；不等于 530 项日常健身动作或对应质量评分 | [官方 FAQ](https://sdolivia.github.io/FineGym/) 的标注 CC BY-NC 4.0；视频来源权利另计 |
| [UI-PRMD 原始论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC5773117/) | 10 项康复动作、10 名健康参与者 | 有正确/故意错误执行、Vicon/Kinect 数据；[表 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC5773117/#T1) 有部分动作的量化非理想条件，不能推广至全部动作或二维机位 | 本次未核实到可直接打包再分发的数据许可；第三方代码许可不能替代数据许可 |
| [KIMORE 原始论文](https://doi.org/10.1109/TNSRE.2019.2923060) | 5 项康复动作、78 人 | 深度、骨架、RGB、运动学特征与临床评价；限特定康复场景 | 未确认可自由再分发的统一许可，RGB 需另行联系作者 |

以上受限研究数据未下载、未申请访问、未复制到项目，也未自动接受授权协议。

## 文本和媒体的来源限制

保留 [上游许可](../src/data/free-exercise-db/LICENSE.md) 和 [上游 JSON Schema](../src/data/free-exercise-db/upstream-schema.json)。上游源自 [wrkout/exercises.json](https://github.com/wrkout/exercises.json)，不是由本项目教练审核产生的说明。

图片的权利存在具体未解决问题：[issue #2](https://github.com/yuhonas/free-exercise-db/issues/2)、[issue #13 的维护者回复](https://github.com/yuhonas/free-exercise-db/issues/13#issuecomment-5154712995)。本次仅保留上游图片的固定提交 URL 引用，不下载、打包或展示图片；输出标记 `mediaRights: "unverified"`。仓库 Unlicense 标识不是第三方媒体权利已核实的证明；文本来源也保留审查记录。

876 条目中，`Iron_Cross`、`One-Arm_Kettlebell_Swings`、`Push_Press`、`Side_Bridge`、`Side_Jackknife` 的说明数组为空；`Barbell_Squat_To_A_Bench` 和 `Clean` 的说明数组含空步骤。插件原样保留，分别标记 `missing` 和 `partial`，不补写或删除条目。其他条目的 `available` 仅表示步骤字段存在，不表示专业有效性已经验证。

## 对外数据标准

契约见 [exercise-contracts.ts](../src/exercise-contracts.ts)，请求的 JSON Schema 见 [exercise-goal.schema.json](../schemas/exercise-goal.schema.json)。新服务数据使用 `schemaVersion: "1.0"`，仅包含可序列化字段，Web 与 Android 可分别实现传输适配器。

- 动作标识沿用上游 `id`，与提交版本一起追踪。`squat`、`深蹲` 显式映射到 `Bodyweight_Squat`；`push-up`、`pushup`、`俯卧撑` 映射到 `Pushups`。不把杠铃深蹲等变体隐式等同于徒手深蹲。
- 标识查找忽略大小写与两侧空格；名称仅供搜索，不做模糊标识匹配。名称和步骤保留上游英文，未将自动翻译作为标准原文。
- 名称、肌群、器械、难度与类别来自原始记录；未知器械保留 `null`。返回固定提交的 `sourceUrl`、`sourceRevision`，不依赖在线更新。
- `list` 默认 50 条、最多 100 条，`offset` 从 0 开始，按固定源文件顺序分页。可同时按关键词、类别、难度、器械、主/次肌群和质量评分状态筛选。
- `scoreGoal` 接受 `sessionId`、`exerciseId`、`unit`、`target`、`observed`、`confidence`、`observationSource`。单位为 `repetitions`（次）、`seconds`（秒）、`meters`（米）；同一次请求的目标与观测单位相同，由调用方选择适合该训练方案的单位，不从类别猜测处方。
- 目标必须大于 0，观测值可以为 0，二者最多 `1e9`；次数必须是整数。置信度在 0–1，低于 0.6 返回 `INSUFFICIENT_DATA`。它是数据生产方量表上的可靠性值，不是动作合格概率。
- `observationSource` 为 `manual`、`sensor` 或 `pose`，记录数据生产方声明的来源；服务不据此证明动作真实执行、身份、设备精度或姿态质量。尚无识别适配器的动作也能接收人工或设备观测。
- 当前二维骨架仍遵守 [视觉契约](../src/vision-contracts.ts)：17 个 COCO/MoveNet 点、原图像素、解码器 PTS 毫秒。研究数据的三维米坐标、GHUM/SMPLX、临床量表不能直接塞入该骨架或评分契约，需要专门适配。

## 评分标准及可执行范围

每个目录动作都能查询 `getStandard(id)`，返回动作说明与两类明确区分的标准。

**目标完成度**：全部 876 条目可用，策略 `personal-goal-completion@1.0.0`，公式 `100 * min(observed / target, 1)`，结果保留两位小数。目标由调用方提供；它是本项目公开定义的训练记录计算规则，没有宣称来源库、学校或学术数据集规定了该公式。超过目标不加分。返回 `scoreKind: "goal-completion"`、`techniqueScore: null`，不能解释为动作做得标准，也不提供医疗或训练处方。

**动作质量**：仅 `Bodyweight_Squat` 和 `Pushups` 关联现有 `demo-squat-score@0.1.0` / `demo-push-up-score@0.1.0`。标准公开置信度门槛 0.6、完成度/幅度/稳定性/节奏权重 20/40/25/15、2–5 秒节奏区间、观察契约 `workout@1.0`、`origin: "project"`、`validation: "uncalibrated"`。这些数值保持已有演示行为，并非来自本次导入的目录或官方标准。

其余 874 项返回 `technique.status: "unavailable"`、`reason: "no-calibrated-policy"`。调用现有 `fitnessScoring.score` 会返回 `STANDARD_UNAVAILABLE`，不把深蹲规则复制到所有动作。未知标识为 `UNSUPPORTED_EXERCISE`；请求格式错误为 `INVALID_EXERCISE_DATA`；原始目录加载损坏为 `CATALOG_INVALID`。视频分析仍仅支持 `squat` 与 `push-up`，目录增加不代表新建了 874 个视频算法。

后续某项质量标准进入可用状态，需要提供动作变体、观测指标定义和单位、机位与坐标约束、阈值/模型来源、规则版本、授权范围和人工标注验证结果。可替换动作库及评分提供方，或为新观测模式增加独立服务；无需向运行时加入动作分支。

## 插件调用与生命周期

消费方声明 `static inject = ['fitnessExercises']` 后调用：

```ts
const page = ctx.fitnessExercises.list({ muscle: 'quadriceps', limit: 20 });
const exercise = ctx.fitnessExercises.get('Bodyweight_Squat');
const standard = ctx.fitnessExercises.getStandard('squat');
const result = ctx.fitnessExercises.scoreGoal({
  schemaVersion: '1.0', sessionId: 'session-001', exerciseId: exercise.id,
  unit: 'repetitions', target: 10, observed: 8, confidence: 1, observationSource: 'manual',
});
```

调用返回值用于请求/响应；完成后同步发出 `fitness/exercise-goal-scored` 结果通知。目录服务可供后加载的插件查询，不依赖一次性启动广播。返回对象和嵌套数组冻结，调用方不能篡改后续评分参数。提供方没有定时器、网络连接、子进程或逐用户共享可变状态；卸载通过 Cordis 撤销服务，依赖它的评分消费方暂停，重新挂载后恢复。

命令示例：

```sh
pnpm start exercises manifest
pnpm start exercises list --query squat --limit 10
pnpm start exercises list --category strength --equipment "body only" --muscle quadriceps
pnpm start exercises show Bodyweight_Squat
pnpm start exercises standard squat
pnpm start exercises standard Alternate_Incline_Dumbbell_Curl
pnpm start exercises score-goal examples/exercise-goal.json
```

最后一条输出完成度 80 分，动作质量分为空。CLI 是现有入口插件的适配，尚未新增 HTTP 路由。构建通过 TypeScript JSON 模块复制数据和来源清单，另复制许可及上游 Schema；运行时不会联网拉取数据。更新数据时下载新的固定提交，并一起更新来源清单、哈希、类别统计和完整性测试，随后重新验证；不要在启动时追踪 `main`。

## 验证

已执行 `pnpm check`：类型检查、57 项 Node.js 测试、ESM 构建通过。其中动作库测试逐条核对 876 个标识、原始说明、标准状态与完成度计算，并覆盖原文件哈希、分页筛选、别名、嵌套冻结、非法输入、低置信度、未知动作、质量标准缺失和提供方卸载/恢复。命令行测试覆盖清单、查询、详情、标准、完成度和错误退出。

已运行编译后的 `exercises manifest`、`exercises score-goal`：得到 876 项目录和 80 分完成度，`techniqueScore` 为空。核对编译目录中原始数据 SHA-256 与来源清单一致，许可与上游 Schema 一并存在。

真实视频回归复用 [既有素材清单](../examples/video-test-set.json) 中的代表性侧面样本，不改动原视频，采用同一模型和预处理：

| 入口 | 样本 | 完整周期 | 质量分 | 标准与证据 |
| --- | --- | ---: | ---: | --- |
| 源码 CLI | `b2651023cb33324a55baf13aa6ae04a1` 深蹲 | 5 | 89.98 | `demo-squat-score@0.1.0`；[结果](../artifacts/exercise-library-regression-20261016-01/squat/assessment.json) |
| 编译 CLI | `631c726ae859c444011c8e4a7a8cc1c4` 俯卧撑 | 5 | 74.70 | `demo-push-up-score@0.1.0`；[结果](../artifacts/exercise-library-regression-20261016-01/push-up/assessment.json) |

两项与 [既有视频基线](movenet-validation.md) 一致，结果新增 `score.standard.exerciseId` 和目录提交版本，便于追踪。没有修改 Python 推理、预处理或运动周期规则，本次未重复运行 Python 几何测试。

本次验证只支持上述契约、构建和两个真实样本的行为保持一致，没有取得专业人员对 876 项动作的执行真值，也未验证其姿态质量或视频识别准确率。
