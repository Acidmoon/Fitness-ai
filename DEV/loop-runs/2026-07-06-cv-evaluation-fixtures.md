# Loop Run: cv-evaluation-fixtures

日期：2026-07-06

## 所选任务

- id: `cv-evaluation-fixtures`
- risk: `low`
- 起始状态：`pending`，本轮开始后标记为 `in_progress`

## 已检查文件

- `DEV/CV_LOOP_POLICY.md`
- `DEV/LOOP_STATE.md`
- `DEV/LOOP_QUEUE.md`
- `app/services/exercise_pose_scoring.py`
- `app/services/exercise_rules/pushup.py`
- `app/services/exercise_rules/squat.py`
- `app/services/exercise_rules/repetition_counter.py`
- `app/services/pose_features.py`
- `app/services/pose_error_detection.py`
- `tests/test_exercise_pose_scoring.py`
- `tests/test_pushup_phase_detection.py`

## 已修改文件

- `tests/fixtures/cv_evaluation_samples/README.md`
- `tests/fixtures/cv_evaluation_samples/samples.json`
- `tests/test_cv_evaluation_fixtures.py`
- `DEV/LOOP_STATE.md`
- `DEV/LOOP_QUEUE.md`
- `DEV/loop-runs/2026-07-06-cv-evaluation-fixtures.md`

## 已执行动作

- 新增离线 synthetic keypoint fixture 位置，不包含真实用户视频、图片或个人数据。
- 新增 4 个 CV evaluation samples：标准俯卧撑、深度不足俯卧撑、标准深蹲、深度不足深蹲。
- Expected outputs 覆盖 count、invalid reasons、video quality status 和代表性 movement error codes。
- 新增 fixture loader 测试，将 compact synthetic recipe 展开成生产评分使用的 canonical keypoint frame schema。
- 保持生产评分规则、API contract、数据库 schema 和默认 pose backend 不变。

## 验证命令与结果

```powershell
.\venv\Scripts\python.exe -m pytest tests\test_cv_evaluation_fixtures.py -q
```

结果：4 passed。

```powershell
.\venv\Scripts\python.exe -m pytest tests\test_exercise_pose_scoring.py tests\test_pushup_phase_detection.py -q
```

结果：27 passed。

## 对抗式审查

- 数据风险：fixture 只保存 synthetic angle/keypoint recipes，不保存真实用户媒体或个人数据。
- 行为回归：未修改生产评分代码；用现有评分测试和 push-up phase tests 验证未破坏俯卧撑、深蹲评分路径。
- Schema 风险：测试 loader 生成 `pose_analysis.frames[*].keypoints[*]` canonical keypoint shape，避免引入第二套生产输入格式。
- 过度锁定风险：测试只锁定验收要求的稳定输出，不锁死每个内部分数细节。
- 深蹲几何风险：标准深蹲样例不添加非必需肩点，避免肩髋重合造成 body-line feature 计算异常；前倾样例使用不重合肩点。

## 队列和状态更新

- `DEV/LOOP_QUEUE.md`：`cv-evaluation-fixtures` 从 `in_progress` 更新为 `done`。
- `DEV/LOOP_STATE.md`：`status` 更新为 `ready`，`active_task` 更新为 `none`，`latest_run_log` 指向本记录。

## 剩余风险

- 当前 fixtures 是 synthetic keypoints，只验证规则管线的 deterministic behavior，不代表真实视频模型输出分布。
- 后续如需真实视频评估，应单独经过隐私、体积和授权门禁。
