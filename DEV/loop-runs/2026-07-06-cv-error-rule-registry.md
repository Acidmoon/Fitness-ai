# Loop Run: cv-error-rule-registry

日期：2026-07-06

## 所选任务

- id: `cv-error-rule-registry`
- risk: `low`
- 起始状态：`pending`，本轮开始后标记为 `in_progress`

## 已检查文件

- `DEV/CV_LOOP_POLICY.md`
- `DEV/LOOP_STATE.md`
- `DEV/LOOP_QUEUE.md`
- `DEV/loop-runs/2026-07-06-cv-evaluation-fixtures.md`
- `DEV/错误动作识别设计.md`
- `app/services/pose_error_detection.py`
- `app/services/exercise_rules/base.py`
- `app/services/exercise_rules/registry.py`
- `app/services/exercise_rules/pushup.py`
- `app/services/exercise_rules/squat.py`
- `tests/test_exercise_pose_scoring.py`

## 已修改文件

- `app/services/pose_error_detection.py`
- `tests/test_pose_error_detection_registry.py`
- `DEV/错误动作识别设计.md`
- `DEV/LOOP_STATE.md`
- `DEV/LOOP_QUEUE.md`
- `DEV/loop-runs/2026-07-06-cv-error-rule-registry.md`

## 已执行动作

- 将 movement error detection 从硬编码 exercise 分支改为显式 `ERROR_RULE_DEFINITIONS` registry。
- 新增 `get_error_rule_definitions()` 和 `get_registered_error_codes()`，支持按 exercise key 和稳定 error code 发现规则。
- 保留现有俯卧撑和深蹲 error detector、error code、反馈文案、阈值和输出顺序。
- 新增 registry 聚焦测试，覆盖俯卧撑、深蹲、unknown exercise。
- 更新错误动作识别设计文档，说明未来动作如何新增显式错误动作规则。

## 验证命令与结果

```powershell
.\venv\Scripts\python.exe -m pytest tests\test_pose_error_detection_registry.py -q
```

结果：3 passed。

```powershell
.\venv\Scripts\python.exe -m pytest tests\test_pose_error_detection_registry.py tests\test_exercise_pose_scoring.py tests\test_cv_evaluation_fixtures.py -q
```

结果：28 passed。

## 对抗式审查

- 输入风险：unknown exercise 通过 registry 查询返回空列表，`detect_pose_errors()` 不会因缺少注册项崩溃。
- 回归风险：注册顺序保持旧分支顺序，既有俯卧撑和深蹲 error code、反馈文案、阈值和 evidence builder 没有改变。
- 扩展风险：避免使用匿名 lambda 作为 registry detector，改为命名小函数，便于未来新增动作和测试定位。
- 范围风险：未修改 scoring weights、API response contract、数据库 schema、默认 pose backend 或真实用户数据。
- 测试覆盖：聚焦测试验证可发现 error codes、现有 range/depth code 仍输出、unknown exercise 返回空 movement errors；评分与 fixture 回归测试验证现有行为仍通过。

## 队列和状态更新

- `DEV/LOOP_QUEUE.md`：`cv-error-rule-registry` 从 `in_progress` 更新为 `done`。
- `DEV/LOOP_STATE.md`：`status` 更新为 `ready`，`active_task` 更新为 `none`，`latest_run_log` 指向本记录。

## 剩余风险

- Registry 只整理当前 deterministic movement error rules，不新增错误分类能力。
- 后续如果调整阈值、反馈文案或评分权重，应作为独立任务并配套回归测试。
