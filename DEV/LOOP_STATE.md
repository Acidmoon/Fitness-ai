# Fitness AI CV Loop 状态

最后更新：2026-07-06
Schema 版本：1

本文件是无人值守 CV Loop 的两个持久状态源之一。
另一个持久状态源是 `DEV/LOOP_QUEUE.md`。

当前聊天上下文不是状态源。后续运行必须从以下文件恢复上下文：

1. `DEV/CV_LOOP_POLICY.md`
2. `DEV/LOOP_STATE.md`
3. `DEV/LOOP_QUEUE.md`
4. `DEV/loop-runs/` 下最新的相关运行记录

## 当前 Loop 状态

| 字段 | 值 |
| --- | --- |
| loop_name | Fitness AI CV Loop |
| loop_goal | 在风险门禁约束下，渐进式改进计算机视觉分析闭环。 |
| status | ready |
| active_task | none |
| max_tasks_per_run | 1 |
| latest_run_log | `DEV/loop-runs/2026-07-06-cv-evaluation-fixtures.md` |
| queue_file | `DEV/LOOP_QUEUE.md` |
| policy_file | `DEV/CV_LOOP_POLICY.md` |

## 恢复检查清单

每次后续 Loop 运行在行动前必须完成：

1. 阅读 `DEV/CV_LOOP_POLICY.md`。
2. 阅读本文件。
3. 阅读 `DEV/LOOP_QUEUE.md`。
4. 只检查所选任务需要的文件。
5. 最多选择一个依赖已满足的任务。
6. 写代码前应用风险门禁。
7. 在 `DEV/loop-runs/` 下写入一份运行记录。
8. 如果任务状态变化，同步更新本文件和 `DEV/LOOP_QUEUE.md`。
9. 运行最相关的验证。
10. 当仓库规则要求时，提交并推送已完成的变更。

## 风险门禁快照

| risk | 无人值守行为 |
| --- | --- |
| low | 依赖满足且范围不超过验收标准时，可以自动实现。 |
| medium | 可以检查、写方案、创建 fixtures 或更新文档；没有当前对话中的人工确认时，不得实现会改变行为的代码。 |
| high | 没有当前对话中的人工确认时，不得实现或修改行为。 |

完整规则见 `DEV/CV_LOOP_POLICY.md`。

## 仓库快照

记录时间：2026-07-06

| 区域 | 当前状态 |
| --- | --- |
| branch | `main` tracking `origin/main` |
| backend | FastAPI 服务已有 MoveNet runtime、pose backend registry、canonical keypoint result、exercise rules、pose scoring 和 video analysis services。 |
| exercise rules | 现有模块包括 `pushup`、`squat`、`base`、`registry`、`repetition_counter`。 |
| scoring evidence | Pose scoring response 已暴露 `auto_count`、`count_source`、`metrics.valid_reps`、`metrics.invalid_reps`、`metrics.quality`、`metrics.errors`。 |
| Web client | React/Vite 客户端已有 record detail 和 pose scoring preview 展示面。 |
| Android client | Kotlin/Jetpack Compose 客户端已有 API scoring data 映射和 analysis display 组件。 |
| planning docs | `DEV/体适能AI管家-计算机视觉与个性化算法路线图.md` 和 `DEV/动作分析模块化设计.md` 定义当前 CV 方向。 |

## 持久不变量

- 普通手机视频或上传视频仍是主要输入。
- 除非人工批准切换默认后端，否则 MoveNet 保持为轻量默认 pose backend。
- Pose backend 必须先输出 canonical keypoint frames，再交给下游规则消费。
- 评分必须可解释，尽量保留 count、phase evidence、confidence、quality dimensions、errors 和 feedback。
- 当分析结果可能存储或对外展示时，应尽量保留 rule version 或 quality version。
- 新动作逻辑优先放在 `app/services/exercise_rules/<action>.py`，再通过 `registry.py` 注册，避免堆进一个大型共享评分函数。
- 后续 Loop 运行不得把聊天记忆当成状态源。

## 执行游标

已完成任务：`cv-quality-mvp`、`cv-evaluation-fixtures`。

本次运行完成 CV 评分样例评估 fixtures，并保持每轮最多一个任务。

## 状态日志

| 日期 | 事件 | 说明 |
| --- | --- | --- |
| 2026-07-06 | Loop 框架初始化 | 创建持久状态、任务队列、风险策略和运行记录格式。 |
| 2026-07-06 | 完成 `cv-quality-mvp` | Pose scoring response 新增 `metrics.quality.video` 质量证据和聚焦测试。 |
| 2026-07-06 | 完成 `cv-evaluation-fixtures` | 新增 synthetic keypoint fixtures、消费测试和 fixture 文档。 |
