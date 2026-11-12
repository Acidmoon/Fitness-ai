# 最小可用 HTTP 入口契约（冻结）

本契约在 `649c8d1` 基线上冻结，接口线与前端线共同遵守。改动需先回到主管这里改契约，再改实现。认证与运动历史两条线合入后，本文件按实现对齐过一次文档（只改文档，未改代码）。

> **认证与运动历史不在本文件。** 本文件冻结的是基础入口与路由注册机制。`/api/auth/*`（5 条）与 `/api/workouts*`（5 条）**已经实现并合入 `integration`**，它们的权威契约是 [`auth-history-contract.md`](auth-history-contract.md)。本文件只保留一份指路索引（见「认证与运动历史路由（条件注册）」一节），细节一律以那一份为准，避免两处写法各自漂移。

## 范围

- 只做最小可用前端所需的一条主流程：给一段服务器本地视频 → 分析 → 看到评分与建议。
- 只用 Node.js 内置 `node:http`，不新增 npm 依赖。
- 页面内不做浏览器上传、不做异步任务队列、不做多页面。服务端另有 `POST /api/uploads` 供客户端直传字节流（见「数据面路由」），页面本身仍不使用它。
- 基础路由（`/api/health`、`/api/videos`、`/api/exercises`、`/api/exercises/{id}/standard`、`/api/assessments`、`/`）不要求认证，也不依赖数据库。
- 认证与运动历史路由是**条件注册**的：只有对应插件装载时才出现；未装载时这些路径返回 404 是设计行为，不是缺陷。

## 运行方式

- 新增运行方式入口 `src/http-main.ts`（与 `src/user-db-main.ts` 同级：只挂载 + 常驻）。
- HTTP 插件只由 `src/http-main.ts` 装载，不进 `src/app.ts` 的 CLI 清单，避免 CLI 模式被端口占住。
- 监听地址默认 `127.0.0.1:8787`，由 `FITNESS_HTTP_HOST` / `FITNESS_HTTP_PORT` 覆盖。
- **基础路由不做鉴权**的前提是只绑 `127.0.0.1`；认证与历史路由则要求 Bearer（见「认证与运动历史路由（条件注册）」）。若要绑非回环地址，必须先经 owner 拍板。

## 服务与注册机制

HTTP 入口插件提供服务 `fitnessHttp`。全部类型定义在 `src/http-contracts.ts`（新契约文件，不改 `src/contracts.ts` 的既有语义）。以下是冻结的确切形状，前端插件按此写码：

```ts
import type { Disposable } from './http-contracts.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  readonly method: HttpMethod;
  /** 请求路径，不含查询串。 */
  readonly path: string;
  readonly url: URL;
  readonly query: URLSearchParams;
  /** 路由模式里 `{name}` 命中的值；精确路径路由为空对象。 */
  readonly params: Readonly<Record<string, string>>;
  /** 键统一小写；同名头出现多次时用 `, ` 连接。 */
  readonly headers: Readonly<Record<string, string>>;
  /** 原始请求体；没有请求体时是空串。 */
  readonly body: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** 响应体按字节写出；JSON 用 `jsonResponse` 组装。 */
  readonly body: string | Uint8Array;
}

export type HttpRouteHandler = (request: HttpRequest) => Promise<HttpResponse> | HttpResponse;

export interface HttpRoute {
  readonly method: HttpMethod;
  /** 精确路径，或含 `{name}` 路径参数的模式，如 `/api/exercises/{id}/standard`。 */
  readonly path: string;
  readonly handler: HttpRouteHandler;
}

export interface FitnessHttp {
  /** 同一方法 + 同一路径模式只能注册一次，重复注册抛错。返回同步注销函数。 */
  register(route: HttpRoute): Disposable;
}

/** 供需要返回 JSON 的路由使用。 */
export function jsonResponse(status: number, body: unknown): HttpResponse;
```

- 前端插件只 `import` `src/http-contracts.ts` 的类型与 `jsonResponse`，**不 import** `src/plugins/http-api.ts` 的实现，满足「消费方不得 import 其他插件实现」。
- `register` 返回 `Disposable`（同步注销函数）。注册与注销由 Cordis 插件生命周期管理；前端插件在 `static inject = ['fitnessHttp']` 后于构造期注册路由，插件卸载时注销。
- **`body` 是 `string` 时默认响应头为 `text/plain; charset=utf-8`**。返回 HTML 必须显式设 `headers: { 'content-type': 'text/html; charset=utf-8' }`，否则浏览器会把源码当纯文本显示。

### 路由匹配

- 精确匹配 + 路径参数，风格与 `GET /api/exercises/{id}/standard` 一致。
- 同一方法 + 同一路径模式只能有一个注册方；重复注册必须报错，不得静默覆盖。
- 匹配优先级：静态段优先于路径参数；静态段多者优先。

### 错误信封

所有非 2xx 响应统一为：

```json
{ "error": { "code": "<FitnessErrorCode>", "message": "..." } }
```

`code` 取 `FitnessErrorCode` 联合类型（见 `src/contracts.ts`），不使用自定义字符串。

## 路由清单

### `GET /api/health`

响应 200：

```json
{
  "schemaVersion": "1.0",
  "status": "ok",
  "services": ["fitnessVideo", "fitnessExercises", ...],
  "uptimeMs": 1234
}
```

`services` 只列出当前作用域内**已激活**的服务名，不包含未激活的插件。

### `GET /api/videos`

- 查询：`limit`（1–200，默认 100）、`offset`（默认 0）。
- 视频根目录由 `FITNESS_VIDEO_ROOT` 指定，**必须显式配置**。
  - 未配置 → **503**，`code` = `INPUT_IO`，`message` = "未配置视频根目录 FITNESS_VIDEO_ROOT"。
  - 已配置但目录不可用（不存在、不是目录、不可读）→ **503**，`code` = `INPUT_IO`，`message` = "视频根目录不可用"。
  - 已配置但请求路径不在根目录内 → **400**，`code` = `INVALID_ARGUMENTS`。

- 响应 200：

```json
{
  "schemaVersion": "1.0",
  "total": 12,
  "items": [{ "path": "relative/path.mp4", "name": "path.mp4", "bytes": 12345 }]
}
```

`path` 为**相对** `FITNESS_VIDEO_ROOT` 的路径，绝不回本机绝对路径。

### `POST /api/assessments`

请求体：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `path` | string | 是 | 服务器本地视频路径；相对 `FITNESS_VIDEO_ROOT` 或绝对路径；解析后（含符号链接解析）必须仍在 `FITNESS_VIDEO_ROOT` 内 |
| `exercise` | "squat" \| "push-up" | 是 | |
| `targetRepetitions` | integer | 是 | 1–10000 |
| `sessionId` | string | 否 | 1–128 字符，默认服务端生成 |
| `sampleFps` | integer | 否 | 1–30，默认 10 |

响应 200 字段（直接由 `fitnessVideo.assess` 的返回值组装，不重新定义业务语义）：

```
schemaVersion, sessionId, exercise,
video: { name, bytes, width, height, sourceFps, totalFrames, decodedFrames, durationMs },
model: { id, sha256 },
sampling: { requestedFps, sampledFrames },
motion: { policy, side, validFrames, rejectedFrames, repetitions[], warnings[] },
score: { policy, standard?, total, dimensions[], quality{} },
advice: { policy, items[] }
```

`motion.repetitions[]` 元素：`startMs, bottomMs, endMs, minAngle, maxAngle, rangeOfMotion, stability, durationMs, confidence`。

`model` 字段来自 `poses.model`，只回 `id` 与 `sha256`，不回 `runtime`/`inputSize`/`preprocessing`。

`video.bytes` 不在骨架契约里，由 HTTP 层调用 `fitnessFiles.openVideo` 取得；该调用同时复用文件校验（扩展名、非空普通文件、≤1 GiB），HTTP 层不重复实现。

### `GET /api/exercises`

- 查询：`query, category, level, equipment, muscle, technique, offset, limit`。
- 响应 200：动作库 `ExercisePage` 原样（`schemaVersion, total, offset, limit, items[]`）。

### `GET /api/exercises/{id}/standard`

- 响应 200：`ExerciseStandard` 原样。

### `GET /`

- 由前端插件通过 `fitnessHttp.register(...)` 注册，返回单页 HTML。

## 认证与运动历史路由（条件注册）

**权威契约是 [`auth-history-contract.md`](auth-history-contract.md)，本节只是索引，不复述细节。** 下列 10 条路由已经实现；它们由 `HttpApiPlugin` 在装载顺序里用服务依赖条件注册，不是无条件存在。

| 方法 | 路径 | 认证 | 注册条件 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | 否 | `fitnessAuth` + `fitnessUsers` |
| `POST` | `/api/auth/login` | 否 | 同上 |
| `POST` | `/api/auth/logout` | 是（Bearer） | 同上 |
| `GET` | `/api/auth/me` | 是（Bearer） | 同上 |
| `POST` | `/api/auth/password` | 是（Bearer） | 同上 |
| `GET` | `/api/workouts` | 是（Bearer） | `fitnessAuth` + `fitnessWorkoutHistory` |
| `POST` | `/api/workouts` | 是（Bearer） | 同上 |
| `GET` | `/api/workouts/statistics` | 是（Bearer） | 同上 |
| `GET` | `/api/workouts/{id}` | 是（Bearer） | 同上 |
| `DELETE` | `/api/workouts/{id}` | 是（Bearer） | 同上 |

- 请求体字段、查询参数、错误码与响应形状全部以 `auth-history-contract.md` 为准；本文件不再重复列一遍，改契约时也只改那一份。
- `/api/workouts/statistics` 靠「静态段优先于路径参数」的匹配规则生效，不会被当成 `{id}`。
- 两组路由都不接受请求体里的 `tenantId`/`userId`/`actorId`/`verified`，身份只取自会话行。
- `POST /api/assessments` **不自动写历史**，历史由 `POST /api/workouts` 显式写入。

## 状态码映射

| 状态码 | 触发条件 |
| --- | --- |
| 400 | `INVALID_ARGUMENTS` / `INVALID_WORKOUT` / `UNSUPPORTED_EXERCISE` / `INVALID_EXERCISE_DATA` / `VIDEO_INVALID`；认证与历史路由的请求体/查询校验失败（含 `USER_INVALID` / `WORKOUT_INVALID`） |
| 401 | 仅认证与历史路由：`AUTH_INVALID_CREDENTIALS`（身份或密码错，不区分是哪一个）/ `AUTH_UNAUTHENTICATED`（缺失、无效、过期或已吊销的 Bearer） |
| 404 | 路由不存在；`INPUT_IO`（文件不存在或不可读）；认证与历史路由的 `WORKOUT_NOT_FOUND`（不存在与不属于该用户同码） |
| 405 | 方法不支持 |
| 409 | 仅认证路由：`AUTH_CONFLICT` / `USER_CONFLICT`（该登录身份已被注册） |
| 422 | `INSUFFICIENT_DATA` |
| 429 | 仅认证路由：`AUTH_LOCKED`（连续失败次数超限，锁定期间密码正确也返回它） |
| 503 | `INFERENCE_BUSY` / `MODEL_UNAVAILABLE`；`FITNESS_VIDEO_ROOT` 未配置或不可用（`INPUT_IO`） |
| 500 | `INFERENCE_FAILED` / `POSE_INVALID` / `CANCELLED`；未预期异常（`INTERNAL_ERROR`，见下） |

认证与历史路由的 401/409/429 语义细节见 [`auth-history-contract.md`](auth-history-contract.md)；本表只保证状态码不冲突。

请求体校验（`POST /api/assessments`）采用与动作库一致的**严格模式**：

- 未知字段 → 400 `INVALID_ARGUMENTS`（不静默忽略，避免拼错字段名后按默认值跑出结果）。
- `GET /api/exercises` 的未知查询参数同样 400。
- `sessionId` 缺省为 `http-<uuid>`。

## 视频根目录与路径安全

- `FITNESS_VIDEO_ROOT` 必须显式配置，不设默认值、不回退到仓库根目录。
- 路径校验：`realpath` 解析后必须仍在根目录内（含符号链接），否则 400。
- 视频文件校验沿用 `fitnessFiles.openVideo`（扩展名、非空普通文件、≤1 GiB），HTTP 层不重复实现。
- 响应中一律不出现服务器本机绝对路径。

## 证据目录

- 本轮**不落盘**证据文件，不新增 `FITNESS_EVIDENCE_ROOT`。
- HTTP 响应不含证据目录引用。

## 异步任务

- 本轮**只做同步**（一次请求一次响应）。
- 不预留 `POST /api/jobs` + `GET /api/jobs/{id}` 外壳。同步响应可能需要几十秒，前端页面需给出等待提示；前端插件负责处理等待态。
- 若 owner 后续要求异步，再由主管回到本契约增补。

## 错误码与状态码的分工

- `FitnessErrorCode` **不新增**成员，不动 `src/contracts.ts` 的既有语义。
- 业务错误的 `error.code` 直接取现有 `FitnessErrorCode`。
- 路由层错误（路由不存在、方法不支持）不属于业务错误，`error.code` 统一取 `INVALID_ARGUMENTS`，靠状态码区分语义：404 = 路由不存在，405 = 方法不支持。
- **未预期异常**（代码缺陷、序列化失败等非业务失败）一律 500，`error.code` 为 **`INTERNAL_ERROR`**。这个码不属于 `FitnessErrorCode`，是 HTTP 层自己的码；`ErrorBody.error.code` 类型本就是 `string`，因此无需改动 `src/contracts.ts`。
  - 不得用 `INFERENCE_FAILED` 兜底未预期异常：那会把「代码 bug」误报成「推理失败」，把排查方向带偏。
  - 未预期异常的错误细节只写服务端日志（`ctx.logger.error`），响应体只回固定的「服务内部错误」，不泄漏堆栈、路径或内部标识。
- 若后续认为 404/405 需要独立错误码，由主管回到本契约统一增补，不在实现里私自扩 `FitnessErrorCode`。

## 权限与安全边界

- **基础路由不要求认证**；认证只覆盖上一节的 `/api/auth/*` 与 `/api/workouts*`，传输方式为 `Authorization: Bearer`，语义以 [`auth-history-contract.md`](auth-history-contract.md) 为准。
- 不做 CSRF，不做 CORS 开放。
- 只绑 `127.0.0.1`。绑定非回环地址前必须经 owner 拍板。「基础路由不做鉴权」与「只监听回环地址」两条必须同时成立，放开任何一条都算改契约。
- 客户端提交的 `tenantId` / `userId` / `actorId` / `verified` 一律 400 拒绝；租户与用户身份只来自会话行。
- 受保护路由未认证一律 401，不泄漏资源是否存在；记录不存在与不属于该用户统一返回 `WORKOUT_NOT_FOUND`。
- 只有 `/api/auth/register`、`/api/auth/login`、`/api/auth/me` 会返回本人资料，其余路由不返回任何个人资料。
- 不返回服务器本机绝对路径。

## 与前端页面的契约

- 页面提交 `POST /api/assessments`，成功后渲染 `score.total`、`score.dimensions[]`、`score.quality`、`advice.items[]`、`motion.repetitions.length`、`motion.warnings[]`。
- 页面调用 `GET /api/videos` 列出可选视频（`path` 为相对根目录的路径），提交时原样回传 `path`。
- 页面调用 `GET /api/exercises` 与 `GET /api/exercises/{id}/standard` 展示动作目录信息（可选）。
- 错误展示：非 2xx 时读 `error.code` 与 `error.message` 原样展示，不吞错误、不伪造成功。
- 本轮页面只覆盖基础主流程：**不登录、不展示历史**。登录页与历史列表页不在本契约范围内；AGENTS.md 写的是「最小前端验收后再讨论下一步（多页面、登录、历史记录、移动端）」，要开这条线得先由 owner 明确「最小前端已验收」。

## 数据面路由（`feat/data-plane` 追加）

这一节的契约全文见 [数据面契约](data-plane-contract.md)。这里只列对外形状。

### `POST /api/uploads`

上传一段视频字节流，返回的 `path` 可直接作为 `POST /api/assessments` 的 `path`。

| 项 | 说明 |
| --- | --- |
| 请求体 | 原始二进制，**不是** JSON、不是 multipart |
| `Content-Type` | 唯一扩展名来源：`video/mp4` `.mp4`、`video/quicktime` `.mov`、`video/x-m4v` `.m4v`、`video/x-msvideo` `.avi`、`video/webm` `.webm`；认不出即 400 |
| `Content-Length` | 必填；缺失 411，超过上限预检即 413 |
| 上限 | `FITNESS_UPLOAD_MAX_BYTES`，默认 512 MiB，硬上限 1 GiB |
| 认证 | `FITNESS_UPLOAD_REQUIRE_AUTH=true`（默认）时须带 `Authorization: Bearer` |

响应 201 `UploadReceipt`：`schemaVersion, id, path, name, extension, bytes, sha256, anonymous, contentType, expiresAt`。

`sha256` 是内容指纹：同一条 `path` 若被覆盖，哈希能证明内容变过。

### `DELETE /api/uploads/{id}`

删除自己的暂存文件。不存在、已过期、属于别的租户或用户，一律 404 `UPLOAD_NOT_FOUND`。成功 204。

### `POST /api/health-metrics`

批量写入生理指标。须 `Authorization: Bearer`。

请求体 `{ schemaVersion:'1.0', samples: MetricSample[] }`，单批上限 500 条，整批一个事务——任一条不合法则整批回滚。

响应 201 `{ schemaVersion, accepted, duplicates, ids[] }`。`duplicates` 是唯一约束命中的条数，重复上报是正常情况。

### `GET /api/health-metrics`

查询参数：`kind`、`from`、`to`、`limit`（1–5000，默认 500）、`after`。未知参数 400。时间窗上限 31 天。

响应 200 `{ schemaVersion, items[], nextCursor }`。`value` 是解密后的明文数值，只出现在响应里。

### `GET /api/health-metrics/summary`

查询参数：`kind`（**必填**）、`from`、`to`、`bucket=hour|day`（默认 `day`）。

响应 200 `{ schemaVersion, kind, unit, bucket, buckets[{ bucketStart, count, min, max, average }] }`。桶按 **UTC** 边界切分，时区换算交给客户端。

### `DELETE /api/health-metrics/{id}`

删除一条样本。不存在或不属于该用户一律 404 `METRIC_NOT_FOUND`。成功 204。

### 指标种类与单位

| `kind` | `unit` | 范围 |
| --- | --- | --- |
| `heart-rate` | `bpm` | 20–250 |
| `spo2` | `percent` | 50–100 |
| `steps` | `count` | 0–200000 |
| `cadence` | `spm` | 0–300 |
| `energy` | `kcal` | 0–20000 |

种类与单位绑定校验：`{kind:'heart-rate', unit:'percent'}` 是 400 `METRIC_INVALID`。

### 与 `POST /api/assessments` 的关系

评估接口**一行未改**。上传面通过「返回一个符合既有 `path` 契约的相对路径」与它对接，因此两者都不需要知道对方的存在。

`GET /api/videos` 会跳过以 `_` 开头的目录，所以上传暂存区不会污染调试用清单。

