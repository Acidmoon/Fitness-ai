# 最小可用 HTTP 入口契约（冻结）

本契约在 `649c8d1` 基线上冻结，接口线与前端线共同遵守。改动需先回到主管这里改契约，再改实现。

## 范围

- 只做最小可用前端所需的一条主流程：给一段服务器本地视频 → 分析 → 看到评分与建议。
- 只用 Node.js 内置 `node:http`，不新增 npm 依赖。
- 不做浏览器上传、不做登录鉴权、不做异步任务队列、不做数据库接入、不做多页面。

## 运行方式

- 新增运行方式入口 `src/http-main.ts`（与 `src/user-db-main.ts` 同级：只挂载 + 常驻）。
- HTTP 插件只由 `src/http-main.ts` 装载，不进 `src/app.ts` 的 CLI 清单，避免 CLI 模式被端口占住。
- 监听地址默认 `127.0.0.1:8787`，由 `FITNESS_HTTP_HOST` / `FITNESS_HTTP_PORT` 覆盖。
- 不做鉴权的前提是只绑 `127.0.0.1`。若要绑非回环地址，必须先经 owner 拍板。

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

## 状态码映射

| 状态码 | 触发条件 |
| --- | --- |
| 400 | `INVALID_ARGUMENTS` / `INVALID_WORKOUT` / `UNSUPPORTED_EXERCISE` / `INVALID_EXERCISE_DATA` / `VIDEO_INVALID` |
| 404 | 路由不存在；`INPUT_IO`（文件不存在或不可读） |
| 405 | 方法不支持 |
| 422 | `INSUFFICIENT_DATA` |
| 503 | `INFERENCE_BUSY` / `MODEL_UNAVAILABLE`；`FITNESS_VIDEO_ROOT` 未配置或不可用（`INPUT_IO`） |
| 500 | `INFERENCE_FAILED` / `POSE_INVALID` / `CANCELLED`；未预期异常（`INTERNAL_ERROR`，见下） |

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

- 本轮不做登录、Token、鉴权、CSRF、CORS 开放。
- 只绑 `127.0.0.1`。绑定非回环地址前必须经 owner 拍板。
- 不接入用户数据库插件，不返回任何个人资料。
- 不返回服务器本机绝对路径。

## 与前端页面的契约

- 页面提交 `POST /api/assessments`，成功后渲染 `score.total`、`score.dimensions[]`、`score.quality`、`advice.items[]`、`motion.repetitions.length`、`motion.warnings[]`。
- 页面调用 `GET /api/videos` 列出可选视频（`path` 为相对根目录的路径），提交时原样回传 `path`。
- 页面调用 `GET /api/exercises` 与 `GET /api/exercises/{id}/standard` 展示动作目录信息（可选）。
- 错误展示：非 2xx 时读 `error.code` 与 `error.message` 原样展示，不吞错误、不伪造成功。
