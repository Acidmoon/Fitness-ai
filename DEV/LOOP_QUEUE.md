# Fitness AI CV Loop 队列

最后更新：2026-07-06
Schema 版本：1

本文件是后续无人值守 CV Loop 运行的持久状态源。
当前聊天上下文不是状态源。

## 队列规则

- 每轮最多执行一个任务。
- 只有 `status: pending` 且所有 `depends_on` 任务均为 `done` 或为空时，任务才可被选择。
- `risk: low` 任务可在 `allowed_auto_actions` 范围内自动实现。
- `risk: medium` 任务只能生成方案、文档、fixtures 或明确的确认请求；除非当前对话中有人类确认，否则不得实现会改变行为的代码。
- `risk: high` 任务在改变行为前必须获得当前对话中的人工确认。
- 每轮必须写入 `DEV/loop-runs/<date>-<task>.md`。
- 任务状态变化后，必须同步更新本文件和 `DEV/LOOP_STATE.md`。

## 状态值

允许的 status 值：

- `pending`
- `in_progress`
- `blocked`
- `waiting_human`
- `done`

## 任务

### cv-quality-mvp

```yaml
id: cv-quality-mvp
title: 视频质量检测 MVP
status: done
risk: low
priority: P0
depends_on: []
allowed_auto_actions:
  - 检查后端视频与姿态分析流程。
  - 增加有边界的后端质量指标，不做数据库迁移。
  - 新增或更新聚焦的后端测试和 API contract 测试。
  - 更新本地 DEV 文档和运行记录。
not_allowed_auto_actions:
  - 修改认证、鉴权或资源归属检查。
  - 增加重量级模型依赖。
  - 修改默认 pose backend。
  - 拒绝现有成功视频，除非测试和验收标准明确覆盖该行为。
acceptance:
  - Pose analysis response 包含 `metrics.quality.video` 或等价的稳定嵌套质量对象。
  - 质量证据至少覆盖平均关键点置信度、有效帧比例、缺失必需关键点，以及 `ok`、`warning` 或 `invalid` 的整体 `status`。
  - 无效或低质量视频 feedback 面向用户可读，并且不移除现有 `metrics.quality` 评分证据。
  - 聚焦后端测试覆盖 ok、低置信度、缺失关键点和有效帧不足场景。
  - 现有俯卧撑和深蹲评分测试仍通过。
notes:
  - MVP 保持基于规则，并从现有 pose/keypoint 数据派生。
  - 优先向 metrics 增加证据，不引入新的持久化模型。
```

### cv-display-quality-errors

```yaml
id: cv-display-quality-errors
title: Web 和 Android 展示 metrics.quality 与 metrics.errors
status: pending
risk: medium
priority: P1
depends_on:
  - cv-quality-mvp
allowed_auto_actions:
  - 检查 Web 和 Android 的分析结果展示面。
  - 输出包含精确文件、UI 状态和测试的实现方案。
  - 增加不改变行为的文档或当前缺口截图说明。
  - 请求人工确认后再实现。
not_allowed_auto_actions:
  - 未经人工确认直接实现跨客户端 UI 改动。
  - 修改 API response contract。
  - 移除现有 score、count、feedback 或 training-record 展示行为。
acceptance:
  - 方案明确 Web 中渲染 record detail 或 pose scoring preview 的文件。
  - 方案明确 Android DTO、mapper 和 Compose 展示文件。
  - 方案定义空数据、部分数据、warning、invalid 和完整 quality/error 数据的展示行为。
  - 方案列出完成前需要的聚焦 Web 和 Android 测试。
  - 经人工批准并实现后，两个客户端都能展示 quality dimensions 和 movement errors，且不隐藏现有 feedback。
notes:
  - 此任务跨两个客户端，并影响用户对分析结果的理解，因此为 medium risk。
```

### cv-evaluation-fixtures

```yaml
id: cv-evaluation-fixtures
title: CV 评分样例评估 fixtures
status: done
risk: low
priority: P0
depends_on: []
allowed_auto_actions:
  - 创建小型 synthetic keypoint fixtures 供测试使用。
  - 增加 fixture README 和 expected-output metadata。
  - 增加可消费 fixtures 的聚焦测试，不存储真实用户视频。
  - 更新 DEV 文档和运行记录。
not_allowed_auto_actions:
  - 提交真实用户视频或个人数据。
  - 增加大型二进制文件。
  - 在 fixture 驱动修复之外重写生产评分规则。
acceptance:
  - 仓库包含一个有文档说明的 CV evaluation samples fixture 位置。
  - Fixtures 至少覆盖标准俯卧撑、深度不足俯卧撑、标准深蹲、深度不足深蹲。
  - Expected outputs 包含 count、invalid reasons、quality status，以及适用时的 representative errors。
  - 测试可离线运行，不需要模型下载。
  - Fixture 文档说明未来如何安全增加样例。
notes:
  - 第一轮自动化 fixture 优先使用 synthetic keypoint JSON，而不是原始视频。
```

### cv-squat-phase-enhancement

```yaml
id: cv-squat-phase-enhancement
title: 深蹲阶段增强
status: pending
risk: medium
priority: P1
depends_on:
  - cv-evaluation-fixtures
allowed_auto_actions:
  - 检查现有 squat rule、repetition counter 和测试。
  - 输出显式 squat phases 与 evidence fields 的设计方案。
  - 如果 fixtures 缺口仍存在，把缺口补入队列。
  - 请求人工确认后再做行为改变实现。
not_allowed_auto_actions:
  - 未经人工确认修改深蹲计数或评分行为。
  - 修改俯卧撑 phase detection。
  - 未配套专门测试就修改共享 repetition counter 语义。
acceptance:
  - 方案定义深蹲 phase 名称和 transition evidence。
  - 方案在适用时保留共享 `peak -> valley -> peak` 计数。
  - 方案说明深度不足、膝盖内扣和身体前倾如何映射到 phase evidence 或 errors。
  - 方案列出 valid reps、partial reps、low confidence 和 unstable sequences 的回归测试。
  - 经人工批准并实现后，深蹲 response 暴露与俯卧撑 response 可对齐的 phase events。
notes:
  - 此任务会影响 phase 语义、评分和用户反馈，因此为 medium risk。
```

### cv-error-rule-registry

```yaml
id: cv-error-rule-registry
title: 错误动作规则注册表
status: pending
risk: low
priority: P1
depends_on:
  - cv-evaluation-fixtures
allowed_auto_actions:
  - 检查 `pose_error_detection.py` 和 exercise rule modules。
  - 在保持向后兼容的前提下，引入小型 registry 或 metadata table 管理 movement error rules。
  - 增加测试，证明现有俯卧撑和深蹲 error codes 仍会输出。
  - 记录新增 error rules 的注册方式。
not_allowed_auto_actions:
  - 移除现有 error codes。
  - 在 registry plumbing 之外修改 scoring weights 或 feedback wording。
  - 增加基于机器学习的分类器。
acceptance:
  - Error rules 可通过 exercise key 和稳定 error code 发现。
  - 现有俯卧撑 errors 继续覆盖：insufficient range、body-line issue、elbow flare。
  - 现有深蹲 errors 继续覆盖：insufficient depth、knee valgus、forward lean。
  - 测试验证 unknown exercises 不会崩溃，而是返回无已注册 movement errors。
  - 文档说明未来动作如何基于 pose features 增加显式规则检查。
notes:
  - Registry 保持显式、基于规则。
```

### cv-mediapipe-adapter-research

```yaml
id: cv-mediapipe-adapter-research
title: MediaPipe adapter 调研
status: pending
risk: medium
priority: P2
depends_on: []
allowed_auto_actions:
  - 检查现有 pose backend protocol 和 registry。
  - 从官方来源调研 MediaPipe Pose adapter 要求。
  - 写一份 DEV 调研说明，覆盖 dependency、schema、runtime 和测试影响。
  - 提出 adapter 边界和后续低风险任务。
not_allowed_auto_actions:
  - 增加 MediaPipe 依赖。
  - 修改 runtime configuration defaults。
  - 实现或注册 MediaPipe backend。
  - 下载模型 artifacts。
acceptance:
  - 调研说明引用官方 MediaPipe 文档或源码材料。
  - 说明将 MediaPipe landmarks 映射到仓库 canonical keypoint schema，并标出无法映射或存在歧义的点。
  - 说明 Windows、服务器部署和 CI 的 runtime packaging 风险。
  - 说明推荐 adapter 实现风险级别是 low、medium 还是 high，并解释原因。
  - 只有在后续任务足够具体且经过风险门禁时，才更新队列。
notes:
  - 在人工批准依赖和运行时变更前，此任务只做调研。
```
