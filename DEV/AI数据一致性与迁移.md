# AI 数据一致性与迁移

## 核心不变量

1. `records.video_revision` 表示当前视频版本，永久上传或删除视频时递增。
2. `records.analysis_revision` 必须等于 `video_revision`，结果才可读取或评分。
3. `pose_analysis_jobs.video_revision` 在创建任务时固定，任务执行前后都校验。
4. 同一记录最多存在一个 `queued` 或 `running` 任务。
5. `manual_score`、`manual_count` 保存人工输入；AI 评分只是带来源的投影。
6. `keypoints_data`、`feedback`、分析版本和模型版本只能由服务端生成。
7. 删除记录和账户依赖数据库级联；文件清理失败不能恢复已删除数据库行。

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
  -> 推理后 refresh 并再次校验版本
  -> 仅当前版本允许写入结果
```

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
- Web 和 Android 刷新页面或重新进入详情页后能恢复最新任务轮询。
