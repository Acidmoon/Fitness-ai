# AI 数据一致性与迁移

## 核心不变量

1. `records.video_revision` 表示当前视频版本，永久上传或删除视频时递增。
2. `records.analysis_revision` 必须等于 `video_revision`，结果才可读取或评分。
3. `pose_analysis_jobs.video_revision` 在创建任务时固定，任务执行前后都校验。
4. 同一记录最多存在一个 `queued` 或 `running` 任务。
5. `manual_score`、`manual_count` 保存人工输入；AI 评分只是带来源的投影。
6. `keypoints_data`、`feedback`、分析版本和模型版本只能由服务端生成。
7. 删除记录和账户依赖数据库级联；文件清理失败不能恢复已删除数据库行。
8. `keypoints_data.schema_version` 必须等于 `POSE_ANALYSIS_SCHEMA_VERSION`，否则评分拒绝。
9. 记录和任务写入必须通过 `row_version` 条件；ORM flush 自动校验，任务批量更新必须显式带条件或在记录锁内执行，并递增版本。
10. 应用评分要求适用维度证据完整，并保存 `scoring_data`；新视频或成功重新分析清空旧快照和 AI 投影。

## 姿态结果版本迁移（1 → 2）

版本 1 的关键点坐标未做 MoveNet letterbox 还原，非方形视频的几何量被各向异性拉伸，
关节角系统性偏移，因此：

- 存量记录仍保存版本 1 数据，但评分会返回“姿态分析结果版本已过期，请重新分析”。
- 当时重新分析覆盖为版本 2；当前新分析生成版本 3，不需要重新上传视频（`video_revision` 不变）。
- 已有分数与 `analysis_rule_version` 不受影响，可继续展示，只是不能基于旧关键点重算。
- 不做自动回填：批量重算会消耗推理资源，应在低峰期按需重跑。

## 完整证据迁移（2 → 3）

版本 2 可能只分析视频前缀或对采样证据二次抽稀，无法恢复被丢弃的峰谷，因此旧数据保留用于读取，但拒绝重评分。当前新分析必须读至 EOF 且保持全部采样帧；帧数或 JSON 预算超限明确失败。旧分数仍可展示；不要将 v1/v2 的质量分与 v2 新质量公式混合比较。

## 写入守卫迁移（20260930_0002）

新增 `records.row_version`、`pose_analysis_jobs.row_version`（非空，存量行初始化为 1）以及可空 `records.scoring_data`。上线前执行 `alembic upgrade head`，并避免新旧后端同时写库：旧程序不会递增行版本，无法满足守卫不变量。

评分历史不会自动回填；新快照只在应用评分时写入。当前仍是最新应用证据，不支持完整历史重放。目录自定义标准继续覆盖代码默认版本，比较分数时还须检查 `metrics.quality.version` 与实际规则快照。

## 状态转换

```text
上传或删除视频
  -> video_revision + 1
  -> 清空关键点、反馈、分析模型和规则版本
  -> 取消 queued/running 任务
  -> AI score/count 恢复 manual_score/manual_count
```

```text
创建分析任务
  -> 复用当前活动任务，或创建绑定当前 video_revision 的 queued 任务
  -> 独立数据库 Session 执行
  -> 推理前校验版本
  -> 用任务行版本领取 queued，提交 running
  -> 关闭事务后推理
  -> 重新加载记录和任务，校验视频版本及领取版本
  -> 先 flush 记录，再原子提交结果与任务终态
  -> 提交冲突回滚；仅释放仍由本执行持有的任务
```

## 任务活性与回收

推理运行在 API 进程内，部署切换会中断在跑任务，因此遗留的 `queued`/`running`
不得锁住记录：

- 启动对账：`POSE_ANALYSIS_JOB_RECLAIM_ON_STARTUP=true` 时，启动即回收遗留活动任务。
- 超时对账：超过 `POSE_ANALYSIS_JOB_STALE_AFTER_SECONDS`（默认 1800）未写入终态则标为 `failed`。
- 轮询对账：`GET /api/ai/pose-analysis/jobs/{job_id}` 与 `/jobs/latest` 返回前就地回收。
- 回收使用状态和行版本条件更新并递增版本；旧 worker 的最终提交不能覆盖回收终态。
- 回收失败文案固定为「任务超时或分析服务已重启，请重新发起分析」，客户端应提示重试而不是继续轮询。
- 多 worker 或多副本共库时必须关闭启动对账，只保留超时对账，否则会误杀其他 worker 的任务。

## Alembic 接管方式

- 全新数据库：`alembic upgrade head`。
- 历史数据库：先备份，再 `alembic stamp 20260710_0000`，随后
  `alembic upgrade head`。
- 部署脚本的 `db-baseline` 和 `db-migrate` 封装了检测、备份和迁移流程。
- 回滚到基线会删除新增一致性字段，因此回滚前必须保留迁移前备份。

## 验证重点

- 视频替换和删除后，旧结果不可见且旧任务为 `cancelled`。
- 同一记录的并发任务创建不能产生两个活动任务。
- 推理过程中视频变化时，任务取消且 `result_data` 不写入。
- 删除记录或用户后，`pose_analysis_jobs` 不留下孤儿行。
- 进程重启后遗留任务能被回收，且回收后同一记录可以重新创建任务。
- 客户端（Web/Android 已拆到独立仓库）刷新页面或重新进入详情页后能恢复最新任务轮询。
- 版本 1 的关键点被评分拒绝且提示重新分析；重新分析后同一记录可正常评分。
- 评分完成后、提交前的视频替换或人工修改必须触发冲突且不覆盖新状态；任务不会永久停留在 running。
- 同步入口与异步入口共享活动任务约束；同一视频重新分析也会使旧评分失效。

`version_id_col` 只保护 ORM flush，不能自动保护批量更新，见 [SQLAlchemy 官方版本计数文档](https://docs.sqlalchemy.org/en/20/orm/versioning.html)。当前回归覆盖 SQLite 独立会话交错与迁移存量行；PostgreSQL 真正并发事务验证仍待运行。
