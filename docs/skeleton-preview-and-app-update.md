# 骨架预览动图与 Android 应用内更新契约

本文档记录两个独立 Cordis 插件的公开契约、存储边界、安全约束与实测体积：

1. **`SkeletonPreviewPlugin`**（服务名 `fitnessSkeletonPreview`，`src/plugins/skeleton-preview.ts`）
2. **`AppUpdatePlugin`**（服务名 `fitnessAppUpdates`，`src/plugins/app-update.ts`）

两者均通过共享 HTTP 入口的 `fitnessHttp.register(...)` 贡献路由，不改动 `src/runtime.ts`，消费方仅依赖 `src/skeleton-contracts.ts` 与 `src/app-update-contracts.ts`。

---

## 一、骨架预览插件（`fitnessSkeletonPreview`）

### 存储原则

- **不落盘原视频，也不持久化渲染后的 GIF 文件。**
- 每条训练记录仅在 PostgreSQL 中保存一份紧凑、量化、降采样后的加密 `PoseTrack`（表 `fitness_users.workout_pose_tracks`，迁移 `005-pose-tracks.sql`）。
- 访问 `GET /api/workouts/{id}/skeleton.gif` 时，由纯 TypeScript GIF89a 编码器（`src/skeleton-gif.ts`，零新增 npm 依赖）按需渲染动画，并通过插件自持的有界内存 LRU 缓存（默认 `8 MiB`，可通过 `FITNESS_SKELETON_CACHE_BYTES` 调整或置 `0` 禁用，插件卸载时自动清空）避免重复编码。

### 端到端链路

1. `POST /api/assessments` 保持全部既有字段不变，并附带紧凑 `poseTrack`（来自 `compactPoseTrack(poses, motion)`）。
2. 客户端调用 `POST /api/workouts` 保存训练记录获得 `workoutId` 后，再调用受认证的 `PUT /api/workouts/{id}/pose-track` 上传 `poseTrack`（幂等 upsert；上传失败不影响训练记录本身）。
3. 客户端在训练记录详情页请求 `GET /api/workouts/{id}/skeleton.gif`（携带 `Authorization: Bearer <token>`）：
   - 存在轨迹：返回 `200 image/gif`，带 `Cache-Control: private, max-age=86400` 与 `ETag`，支持条件请求 `If-None-Match` 返回 `304 Not Modified`。
   - 历史旧记录（无轨迹）或非本人记录：统一返回 `404 POSE_TRACK_NOT_FOUND`，不泄露记录是否存在。
   - 另提供受认证的 `GET /api/workouts/{id}/pose-track` 返回解密后的 `PoseTrack` JSON（供低版本客户端或调试使用）。

### `PoseTrack` 契约（`schemaVersion: '1.0'`）

- `coordinateSpace`: `'normalized'`（相对旋转后视频帧 `width × height` 的 `0..1` 归一化坐标）
- `width`、`height`: 旋转后源视频帧宽高（像素，用于保持纵横比）
- `fps`: 降采样后的有效帧率（`0 < fps ≤ 10`）
- `coordScale`: `1000`（`x, y ∈ [0, 1000]` 整数，精度 0.1%，在 320px 动图上为 0.32px 亚像素精度）
- `confScale`: `100`（逐点置信度 `c ∈ [0, 100]` 整数）
- `modelId`、`modelSha256`、`motionPolicy`: 完整可追踪标识
- `segments`: 重复段（`kind: 'rep'`，含 `startMs`/`bottomMs`/`endMs`）与静态保持段（`kind: 'hold'`，含 `startMs`/`endMs`），最多 200 段
- `frames`: `1..150` 帧，每帧含严格递增的 `timestampMs` 与 51 个整数 `keypoints`（按 `KEYPOINT_NAMES` 顺序展开 17 个 COCO 关键点 `[x, y, c]`）
- 体积硬上限：`57,344` 字节（56 KiB，为 `UserDataProtectionPlugin` 64 KiB 明文上限留足余量）；超限返回 `413 POSE_TRACK_TOO_LARGE`。

### 实测体积（`src/skeleton-gif.ts` 纯 TS 16 色 4-bit LZW + 脏矩形增量编码）

| 场景 | 降采样帧数 / 帧率 | `PoseTrack` 明文 JSON | 加密信封（入库体积） | 按需渲染 GIF89a 体积（尺寸） |
| --- | --- | ---: | ---: | ---: |
| 短深蹲（23 帧 @ 10fps） | 13 帧 / 10 fps | 3,283 B (3.2 KB) | 4,424 B (4.3 KB) | 10,449 B (10.2 KB, 320×320) |
| 竖屏跳绳 10 次（80 帧 @ 10fps） | 80 帧 / 10 fps | 17,520 B (17.1 KB) | 23,406 B (22.9 KB) | 91,743 B (89.6 KB, 180×320) |
| 横屏平板支撑 10 秒（100 帧 @ 10fps） | 100 帧 / 10 fps | 21,335 B (20.8 KB) | 28,493 B (27.8 KB) | 6,640 B (6.5 KB, 320×180) |
| 长平板 30 秒（600 帧 @ 20fps 降采样） | 121 帧 / 4.01 fps | 27,390 B (26.7 KB) | 36,566 B (35.7 KB) | 8,350 B (8.2 KB, 320×320) |

### 安全、加密与租户隔离

- 迁移 `005-pose-tracks.sql` 创建 `fitness_users.workout_pose_tracks`：
  - 主键 `(tenant_id, workout_id)`，复合外键 `(tenant_id, workout_id) REFERENCES fitness_users.workout_records(tenant_id, id) ON DELETE CASCADE`（删除训练记录自动级联清理轨迹）。
  - 启用 `ENABLE ROW LEVEL SECURITY` 与 `FORCE ROW LEVEL SECURITY`，并在 `src/user-migrations.ts` 的 `assertUserDatabase` 中将强制 RLS 检查表数从 11 张更新为 12 张。
- 载荷经 `fitnessUserDataProtection.seal(['pose-track', tenantId, userId, workoutId], canonicalJson)` 加密，AAD 绑定租户、用户与训练记录 ID；跨记录篡改或置换密文必然解密失败。
- 日志与错误响应绝不输出明文关键点或原始轨迹。

---

## 二、Android 应用内更新发现插件（`fitnessAppUpdates`）

### 路由与契约

- **`GET /api/app/android/latest`**（公开路由，无需鉴权，响应头 `Cache-Control: no-cache`）
- 可选查询参数：`?currentVersionCode=<正整数>`；传入后响应附加布尔字段 `updateAvailable`（`versionCode > currentVersionCode`）。未知或非法查询参数返回 `400 INVALID_ARGUMENTS`。
- 配置环境变量：`FITNESS_APP_RELEASES_FILE`（指向服务端本地 JSON 清单文件）：
  - 未配置：返回 `503 APP_UPDATE_UNAVAILABLE`
  - 文件不存在：返回 `404 APP_UPDATE_NOT_FOUND`
  - JSON 非法或字段不合规范：返回 `503 APP_UPDATE_INVALID`（不泄漏本机文件路径）
- 按文件 `(mtimeMs, size)` 缓存并自动热重载，更新清单文件无需重启后端服务。

### 发布清单 JSON 格式示例

```json
{
  "schemaVersion": "1.0",
  "versionCode": 6,
  "versionName": "1.4.0",
  "minSupportedVersionCode": 3,
  "apkUrl": "https://download.waterhill.cyou/download/2cb797251c53b262",
  "sha256": "234006e0229c5b4e4724e86085d1f1a80da55f1611264fe9ec046c500b601a84",
  "bytes": 10798209,
  "releaseNotes": [
    "新增训练记录详情骨架动图回放",
    "支持应用内检查更新、SHA-256 校验与安装"
  ],
  "publishedAt": "2026-11-20T16:00:00.000Z",
  "mandatory": false
}
```

校验规则：
- 仅接受声明字段（严格拒绝未知键）。
- `apkUrl` **仅允许 `https:` 协议**，拒绝 `http:`、内嵌凭据及非法 URL。
- `minSupportedVersionCode` 必须在 `1..versionCode` 范围内。
- `sha256` 必须为 64 位十六进制串（响应归一化为小写）；`bytes` 必须为正整数；`publishedAt` 必须为带时区的 ISO 8601 时间。
