# AI 姿态分析接口指南

适用范围：`/api/ai` 全部端点，即"视频 → 关键点 → 阶段 → 次数 → 评分与反馈"这条 AI 闭环的对外契约。

契约的两层来源，冲突时以第一层为准：

1. **机器可读**：`docs/openapi.json`，由 `python -m scripts.export_openapi --output docs/openapi.json` 从代码生成，`tests/test_openapi_artifact.py` 会阻止它过期。
2. **本文**：只写 OpenAPI 表达不了的语义——状态机、读取不变量、轮询与回收策略、错误码取舍。

评分维度与错误码的算法含义分别见 `docs/标准度评分体系设计.md` 与 `docs/错误动作识别设计.md`，本文不重复。

## 认证与归属

- 全部端点需要 `Authorization: Bearer <access_token>`；token 由 `/api/auth/login` 或 `/api/auth/refresh` 签发。
- 只能访问自己的记录与任务：记录不属于当前用户时统一返回 **404**（不是 403），避免泄露资源是否存在。
- `keypoints_data`、`feedback`、`analysis_model`、`analysis_rule_version` 等派生字段**不接受客户端写入**，只能由服务端在分析与评分流程中产生。

## 端点总表

| 方法 | 路径 | 用途 | 成功 | 主要错误 |
| --- | --- | --- | --- | --- |
| POST | `/api/ai/records/{record_id}/pose-analysis` | 同步执行分析（阻塞到推理完成，仅适合调试与小视频） | 200 `PoseAnalysisResponse` | 404 / 503 / 400 |
| POST | `/api/ai/records/{record_id}/pose-analysis/jobs` | 创建异步分析任务（**客户端推荐方式**） | 200 `PoseAnalysisJobResponse` | 404 / 403 / 400 |
| GET | `/api/ai/pose-analysis/jobs/{job_id}` | 按任务 id 轮询 | 200 `PoseAnalysisJobResponse` | 404 |
| GET | `/api/ai/records/{record_id}/pose-analysis/jobs/latest` | 取当前视频版本的最新任务（断线重连入口） | 200 `PoseAnalysisJobResponse`，无任务时 `null` | 404 |
| GET | `/api/ai/records/{record_id}/pose-analysis` | 读取已持久化的关键点结果 | 200 `PoseAnalysisResponse` | 404 |
| POST | `/api/ai/records/{record_id}/pose-scoring` | 生成可解释评分与反馈；`apply=true` 时写回训练记录 | 200 `PoseScoringResponse` | 400 / 404 |

## 版本不变量（读取结果前必须理解）

每次永久上传新视频或删除视频都会递增 `records.video_revision`，并清空关键点、反馈与分析版本；分析任务在创建时绑定当时的 `video_revision`，推理前后各校验一次。

由此得到两条客户端规则：

- **结果可读**：仅当 `analysis_revision == video_revision` 时，`PoseAnalysisResponse.status` 才是 `done`；否则返回 `status: "idle"` 且 `frames: []`，此时应重新发起分析而不是渲染旧数据。
- **任务可续**：`/jobs/latest` 已按当前 `video_revision` 过滤，客户端重连时先调它，再决定"继续轮询已有任务"还是"新建任务"，不要凭本地记忆直接新建。

评分同理：`/pose-scoring` 只消费与当前视频版本一致的关键点数据，旧结果不可评分。

## 异步任务状态机

```text
queued ──▶ running ──▶ succeeded
   │           │  └──▶ failed        （推理异常、依赖缺失、超时回收）
   │           └─────▶ cancelled     （视频版本已变化）
   └─────────────────▶ cancelled
```

- 同一记录同一时刻最多一个活动任务（`queued`/`running`），由 `pose_analysis_jobs` 上的部分唯一索引保证；重复 `POST /jobs` 会**复用**已有活动任务并返回 `created=false` 语义的同一 `id`，不会产生两次推理。
- 视频被替换或删除时，旧任务转为 `cancelled`，且 `result_data` 不会写回。

### 进程重启与任务回收

推理运行在后端进程内部（`BackgroundTasks`），部署切换会中断在跑任务。服务端因此回收僵尸任务，客户端**不得**把 `running` 当作"永远会完成"：

- 启动对账：进程启动时回收遗留活动任务（单容器单进程拓扑下立即回收，见 `POSE_ANALYSIS_JOB_RECLAIM_ON_STARTUP`）。
- 超时对账：`queued`/`running` 超过 `POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS`（默认 1800 秒）未写入终态时，被标为 `failed`，`error` 为「任务超时或分析服务已重启，请重新发起分析」。
- 轮询对账：两个 GET 任务端点在返回前就地回收，所以客户端最终一定会看到终态而不会无限轮询。

回收只改任务状态，不写脏数据；结果写入始终受 `video_revision` 守卫。若后端改为多 worker 共库，运维必须关闭启动对账，只保留超时对账。

### 客户端轮询建议

1. `POST /jobs` 拿到 `id`；若返回的 `id` 已存在（复用）也照常轮询。
2. 以 1–2 秒间隔轮询 `GET /pose-analysis/jobs/{job_id}`，指数退避到上限 5 秒；`succeeded`/`failed`/`cancelled` 立即停止轮询。
3. 页面重进或网络中断后，先 `GET /records/{record_id}/pose-analysis/jobs/latest`，`null` 才新建任务。
4. `status == "succeeded"` 后再取 `/pose-analysis` 或 `/pose-scoring`，不要从任务响应里猜关键点数据。

## 关键点结果结构

`PoseAnalysisResponse.frames[]` 每帧为后端归一化后的 canonical 结构（所有姿态后端都必须先产出该结构，下游规则才允许消费）：

```json
{
  "frame_index": 12,
  "timestamp_ms": 2400,
  "coordinate_space": "image_pixels",
  "frame": {"width": 1280, "height": 720},
  "keypoints": [{"name": "left_shoulder", "x": 612.4, "y": 240.1, "score": 0.93}]
}
```

- `coordinate_space` 恒为 `image_pixels`，坐标是原图像素值，客户端可直接叠加绘制。
- `keypoints` 固定 17 个 COCO 风格点：`nose`、`left_shoulder`…`right_ankle`；`score` 为该点置信度。
- 顶层 `summary` 给出 `total_frames`、`processed_frames`、`sampled_frames`、`valid_frame_count`、`average_confidence`、`source_fps`、`sample_fps`，用于解释这次分析抽了多少帧、可信度如何。
- 存储侧会压缩采样帧序列，因此 `summary.sampled_frames` 可能小于视频总帧数，`frames` 是抽样证据不是逐帧全集。

## 评分响应

`PoseScoringResponse` 顶层：`status`（`scored`/`unsupported`）、`applied`、`exercise_type`、`rule_version`、`score`、`count`、`auto_count`、`count_source`、`confidence`、`feedback[]`、`metrics` 。

`metrics` 是"可解释"的落点，客户端至少应能拿到：

| 键 | 含义 |
| --- | --- |
| `rule` | 本次评分生效的标准快照：`rule_version`、`criteria_source`、`measurement_notes`、全部生效阈值 `thresholds`、`required_keypoints`、`joint_triplets`。阈值可被目录行 `Exercise.standard.pose_scoring` 覆盖，所以这是唯一能确定“这个分数按哪套标准算出”的地方 |
| `valid_frames`、`min_angle`、`max_angle`、`angle_range` | 参与评分的有效帧与关节角行程 |
| `phases[]` | 相位事件：`{phase, frame_index, timestamp_ms, angle}`；周期型动作共用同一套词汇 `ready → down → bottom → up → complete`（俯卧撑取肘角，深蹲取膝角） |
| `valid_reps[]`、`repetitions[]`、`invalid_reps[]` | 每次有效/无效重复的起止帧与失败原因 |
| `count_source` | 计数来源，当前为 `angle_peak_valley` |
| `quality` | 六维标准度评分（`version: standard_quality_v1`、`score`、`weights`、`dimensions`）与 `quality.video` 采集质量（`version: video_quality_v1`、`status: ok/warning/invalid`、置信度、有效帧比例、缺失必需关键点、`feedback`） |
| `errors[]` | 动作错误项：`code`、`label`、`severity`、`feedback`、`evidence` |

展示分数时建议同时展示 `metrics.rule.rule_version`：不同版本的分数与次数不可直接比较。
逐动作判据数值见 `docs/动作评分标准.md`。

规则语义：

- `status: "unsupported"` 表示该动作未在 `app/services/exercise_rules/registry.py` 注册规则，此时 `score`/`count` 为 `null`，不是 0 分。
- 有效帧不足 `rule.min_valid_frames` 时返回 **400**，`detail` 是可展示给用户的原因文案（来自采集质量 feedback），客户端应直接显示而不是通用报错。
- 只有 `apply=true` **且** `status == "scored"` 时才写回记录：`score`、`count`、`feedback`、`score_source`/`count_source` 标为 AI、`analysis_rule_version` 与 `analysis_updated_at` 。评分本身不写 `keypoints_data`，关键点只来自分析端点。
- 首次应用前会把用户当前值快照到 `manual_score`/`manual_count`（已有值不覆盖）；AI 投影失效后读取端恢复人工值，因此用户的手工分数不会被 AI 结果静默抹掉。
- 展示分数时应一并展示 `auto_count` 与 `metrics.quality`/`metrics.errors`，不要只展示一个总分。

## 错误码取舍

| 场景 | 同步分析 | 创建任务 | 说明 |
| --- | --- | --- | --- |
| 记录不存在或越权 | 404 | 404 | 归属检查统一 404 |
| 记录没有视频 | 400 | 400 | 提示先上传视频 |
| 视频文件丢失 | 404 | 404 | 文件层面不存在 |
| 视频路径非法 | 400 | 403 | 同步接口按推理错误给 400，任务接口按访问语义给 403 |
| 姿态分析未启用 / 缺 TFLite 运行时 / 模型不可用 | 503 | — | 任务接口在创建前只做视频就绪检查，这类失败发生在任务里，客户端会在任务 `error` 中看到 |
| int8 量化模型 | 503 | — | 运行时拒绝反量化不了的模型，避免静默产出错误关键点 |
| 推理异常 | 400 | — | 同上，异步时表现为任务 `failed` |

## 变更纪律

- 新增/修改端点、请求或响应模型后，必须重新生成 `docs/openapi.json` 并跑 `tests/test_openapi_artifact.py` 与 `tests/test_api_contract_preservation.py` 。
- 关键点结构变更要同步提升 `POSE_ANALYSIS_SCHEMA_VERSION`，并保留旧结果的读取路径。
- 评分权重、阈值、错误码文案的调整属于行为变更，需配套回归测试并保留 `rule_version`/`quality version` 可追溯。
