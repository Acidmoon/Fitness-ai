# 数据面契约（视频上传 + 可穿戴生理指标）

本契约在 `cf1d8d7`（`feat/http-api`）基线上冻结，分支 `feat/data-plane`。
它接续 `docs/auth-history-contract.md`，只定义**数据进入系统的两条新通路**，不重写既有认证、历史、评估语义。

改契约先回到主管，再改实现。两条线共用同一份契约文件，不许各自复制。

## 为什么需要这一层

安卓客户端要成为应用入口，必须先解决两个已存在的硬缺口：

1. **视频进不来**。`POST /api/assessments` 的 `path` 只接受服务器本地路径（相对 `FITNESS_VIDEO_ROOT` 或绝对路径，且解析后必须仍在根目录内）。手机拍的视频无法进入评估链路。
2. **可穿戴数据完全空白**。申报书「研究内容」第二块是视觉数据与可穿戴设备（心率、血氧、步频）的融合分析，仓库中零实现（2026-11-12 全量关键词扫描：`wearable`/`心率`/`血氧`/`步频` 各命中 0 处）。

手机是唯一能同时提供摄像头与 Health Connect / BLE 手环数据的设备。因此这一层不是「提前做第三阶段」，而是**补上申报书已承诺、工程尚未开工的部分**。

## 边界（来自 AGENTS.md，最高优先）

- **上传插件不解析视频**。它只负责把字节安全落地、校验体积与类型、给出可被 `fitnessFiles.openVideo` 接受的路径。骨架识别仍归 `fitnessPose`，评估仍归 `fitnessVideo`。
- **可穿戴插件不做评估、不入评分**。本期它只做摄入、查询、聚合。评分公式（`fitnessScoring`）不接受可穿戴输入；不得在规则评分里偷偷读取生理指标。
- **不信任客户端提交的 `tenantId` / `userId`**。可穿戴数据一律从 `fitnessAuth.authenticate(token)` 得到的 `AuthPrincipal` 取。
- **生理指标数值不落明文**。用现有 `fitnessUserDataProtection` 加密，AAD 绑定租户、用户、行 id。
- 同一作用域一个服务名只有一个提供方。不新增第二套注册机制。
- **不改 `POST /api/assessments` 的既有语义**。上传面通过「返回一个符合既有 `path` 契约的相对路径」与它对接，因此评估接口一行都不动。

## 新增服务与文件

| 服务 | 文件 | 职责 |
| --- | --- | --- |
| `fitnessUploads` | `src/plugins/uploads.ts` | 视频字节流接收、类型与体积校验、落盘暂存、过期清理 |
| `fitnessWearables` | `src/plugins/wearables.ts` | 生理指标批量摄入、时序分页查询、按桶聚合、删除 |

契约文件（由主管冻结，两条线只读，**不许各自复制**）：

- `src/upload-contracts.ts`
- `src/wearable-contracts.ts`

## 对既有契约的最小改动

只做四处，全部是**追加或收窄**，不改变任何既有调用方行为：

| 位置 | 改动 | 理由 |
| --- | --- | --- |
| `src/contracts.ts` | `FitnessErrorCode` 追加 7 个成员 | 新失败模式需要可区分的错误码 |
| `src/http-contracts.ts` | `HttpRoute` 追加可选 `body`；`HttpRequest` 追加可选 `bodyStream` | 二进制上传不能走 `body: string`（会 UTF-8 损坏），也不能整块读进内存 |
| `src/plugins/http-api.ts` | `readBody` 按路由声明分派；`collect()` 跳过 `_` 前缀目录 | 前者供流式上传，后者避免暂存文件污染 `GET /api/videos` |
| `src/user-migrations.ts` | 迁移列表追加 `004`；`assertUserDatabase` 强制 RLS 表数 10 → 11 | 新表必须纳入同一套租户隔离校验，否则等于开了个后门 |

`HttpRequest.body` 保持 `string` 类型不变：JSON 路由的既有行为完全不动。二进制路由通过新增的可选字段拿流。

## 新增错误码

`src/contracts.ts` 的 `FitnessErrorCode` 追加 7 个成员（只追加，不改既有语义）：

| 错误码 | 含义 | HTTP |
| --- | --- | --- |
| `UPLOAD_INVALID` | 上传元数据不合法（扩展名、声明体积、缺失头） | 400 |
| `UPLOAD_TOO_LARGE` | 实际字节数超过上限 | 413 |
| `UPLOAD_NOT_FOUND` | 上传不存在、已过期或不属于该用户 | 404 |
| `UPLOAD_UNAVAILABLE` | 未配置视频根目录或暂存区不可写 | 503 |
| `METRIC_INVALID` | 生理指标写入或查询参数不合法 | 400 |
| `METRIC_NOT_FOUND` | 生理样本不存在或不属于该用户 | 404 |
| `METRIC_UNAVAILABLE` | 可穿戴存储未启用（未装载数据库插件） | 503 |

## 配置项（追加到 `.env.example`）

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `FITNESS_UPLOAD_MAX_BYTES` | 否 | `536870912` | 单次上传字节上限，1 MiB–1 GiB（与 `openVideo` 的 1 GiB 上限对齐） |
| `FITNESS_UPLOAD_TTL_MINUTES` | 否 | `120` | 暂存文件保留时长，5–1440 分钟 |
| `FITNESS_UPLOAD_REQUIRE_AUTH` | 否 | `true` | 是否要求 `Authorization: Bearer`。设为 `false` 仅供本地演示，不得用于部署 |

`FITNESS_VIDEO_ROOT` 仍由 HTTP 入口持有，上传插件通过注入读取，不重复定义。

## 上传面

### 落盘布局

```
$FITNESS_VIDEO_ROOT/
  _uploads/
    <tenantId>/<userId>/<uuid>.mp4
    _anonymous/<uuid>.mp4
  ...（既有测试视频）
```

- 目录名固定 `_uploads`，**下划线前缀表示系统保留**。`collect()` 跳过任何以 `_` 开头的目录，因此暂存文件不会出现在 `GET /api/videos` 里。
- 文件名为服务端生成的 UUID v4 + 客户端原扩展名（小写）。**不使用客户端文件名**，避免路径穿越、超长名、非法字符与信息泄漏。
- 扩展名白名单与 `LocalFilePlugin.openVideo` 完全一致：`.mp4` `.mov` `.m4v` `.avi` `.webm`。新增格式必须两边同时改。

### 流式接收

- 入口按 `Content-Length` 预检：缺失或超过 `FITNESS_UPLOAD_MAX_BYTES` 直接 400/413，**不读 body**。
- 逐块写入，边写边累计字节数。实际字节数一旦超过上限，立即销毁写入流、删除半成品文件，返回 413。**不信任 `Content-Length`**：它只是预检，最终以上限与实写字节为准。
- 写入完成后 `fsync` 再关闭，确认 `stat().size === 累计字节`，否则按 `UPLOAD_INVALID` 处理并删除。
- 同时流式计算 SHA-256。**哈希是评估可追溯性的一部分**：同一条 `path` 将来若被覆盖，`sha256` 能证明内容变过。

### 身份与归属

- `FITNESS_UPLOAD_REQUIRE_AUTH=true` 时，上传必须携带 `Authorization: Bearer`，落盘目录按 `_uploads/<tenantId>/<userId>/<uuid>.<ext>` 分租户隔离。**该值只来自 `AuthPrincipal`，不接受请求体或查询串。**
- `false` 时落到 `_uploads/_anonymous/<uuid>.<ext>`，并在响应里显式标注 `anonymous: true`。这一档只用于本地演示与自动化测试。
- **`GET /api/videos` 不区分归属**：它是本地调试用的目录清单，不是租户资源。这一点保持现状，不因上传面新增而改变语义。
- **只有上传返回的 `path` 才应被 `POST /api/assessments` 使用**。评估接口不认证，因此任何人拿到一个 UUID 路径即可评估该文件。UUID 不可猜，这是当前阶段接受的残余风险。下一轮由 owner 决定是否给 `assessments` 加认证；**本轮不擅自加**，也不在文档里假装它已经安全。

### 生命周期

- 过期判定用文件 `mtime`，不用数据库：暂存区无状态，服务器重启不丢，也不引入一张只有临时意义的表。
- 清理是**惰性**的：每次成功上传前，先扫 `_uploads` 里超过 `FITNESS_UPLOAD_TTL_MINUTES` 的文件并删除。不做定时器——这台机器 4 核 7.8G，常驻定时任务不值得为临时文件付出这个代价。
- 清理失败（权限、占用）只记日志，不阻断当次上传。
- 显式删除走 `DELETE /api/uploads/{id}`，只删自己租户/用户目录下的文件；越权与不存在一律 `UPLOAD_NOT_FOUND`，不泄漏文件是否存在。

### 幂等

上传**不做幂等键**。理由：客户端只有一次网络请求，重试代价是重传；真要去重需要服务端保存「键 → 文件」映射，等于为临时数据建一张持久表，与本层「无状态暂存」的定位冲突。若客户端需要「同一段视频不要重复分析」，应复用已有的 `sessionId`（`POST /api/assessments` 已支持调用方指定），那是业务幂等，不是传输幂等。

## 可穿戴面

### 指标种类与单位

单位与种类**绑定校验**，不接受「同值不同单位」的自由组合：

| `kind` | `unit` | 取值范围 | 说明 |
| --- | --- | --- | --- |
| `heart-rate` | `bpm` | 20–250 | 心率 |
| `spo2` | `percent` | 50–100 | 血氧饱和度 |
| `steps` | `count` | 0–200000 | 区间累计步数（配合 `intervalMinutes`） |
| `cadence` | `spm` | 0–300 | 步频 |
| `energy` | `kcal` | 0–20000 | 活动能耗 |

`{kind:'heart-rate', unit:'percent'}` 是 `METRIC_INVALID`。

### 数据模型（`004-wearable.sql`）

明文列只保留可索引的坐标（种类、单位、来源、时间），**数值本身加密**：

```sql
CREATE TABLE fitness_users.wearable_samples (
  tenant_id    uuid NOT NULL,
  id           uuid NOT NULL,
  user_id      uuid NOT NULL,
  kind         varchar(32) NOT NULL CHECK (kind IN ('heart-rate','spo2','steps','cadence','energy')),
  unit         varchar(16) NOT NULL CHECK (unit IN ('bpm','percent','count','spm','kcal')),
  source       varchar(32) NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 32),
  captured_at  timestamptz NOT NULL,
  sealed_value text NOT NULL CHECK (sealed_value LIKE 'v1.%' AND octet_length(sealed_value) <= 4096),
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id),
  CONSTRAINT wearable_sample_unique UNIQUE (tenant_id, user_id, kind, source, captured_at)
);
CREATE INDEX wearable_samples_user_time ON fitness_users.wearable_samples(tenant_id, user_id, captured_at DESC, id DESC);
CREATE INDEX wearable_samples_user_kind ON fitness_users.wearable_samples(tenant_id, user_id, kind, captured_at DESC);
```

要点：

- `ENABLE` + `FORCE ROW LEVEL SECURITY`，策略与其他用户表一致的租户隔离（读 `fitness.tenant_id` 会话变量）。
- **`wearable_sample_unique` 就是幂等**：同一用户、同种类、同来源、同一时刻只保留一条。写入用 `ON CONFLICT DO NOTHING`，重复上报不报错、不重复计数。手环与 Health Connect 同时上报同一条数据时，后到者被丢弃而不是覆盖——**先到者的值胜出**。这个取舍写在这里，不留给实现临时决定。
- 密文 AAD：`['wearable-value', tenantId, userId, sampleId]`。换租户或换行 id 都无法解密，即使整表被复制。
- 明文列**不含数值**，因此库内无法做 `avg()`/`max()`。这是遵守「健康数据不落明文」的代价，见下条。

### 聚合在服务层做

- 查询把密文取出、在服务进程内解密后计算。**不做库内聚合。**
- 规模判断：单用户单日按 1 分钟采样、5 种指标约 7200 条。解密 7200 条 AES-GCM 在 4 核上是个位数毫秒级，可接受。
- 单次查询时间窗上限 **31 天**，超限返回 `METRIC_INVALID` 而不是静默截断。**边界必须显式，不能悄悄少给数据。**
- `list` 分页 `limit` 上限 5000 条（默认 500）。这只是单页返回量，不是扫描量，分页靠游标推进。
- `summary` 必须指定单一 `kind`；31 天窗内该种类的样本若超过 **100000 条**，返回 `METRIC_INVALID`。这个上限来自「解密后才算聚合」的代价：1 分钟采样 × 31 天 ≈ 44640 条，仍在可接受范围。
- 聚合桶 `hour` / `day`，按 `captured_at` 的 **UTC** 边界切分。响应里带回 `bucketStart`（ISO 8601，UTC），客户端自己按本地时区展示。**服务端不猜时区。**

### 批量摄入

- 单请求上限 **500 条**，超限 `METRIC_INVALID`。
- 整批在**一个事务**里写入，任一条不合法则整批回滚。不做部分成功——部分成功会让客户端无法判断该重传哪几条。
- 响应返回 `{ accepted, duplicates, rejected: [] }`。`duplicates` 是 `ON CONFLICT` 命中的条数，属正常情况。
- `capturedAt` 必须是带时区的 ISO 8601；**不接受无时区的时间**（`2026-11-12T10:00:00`），无法判断是哪个时区的事件。

### 与运动记录的关联

- 本期**不做服务端隐式 join**。运动记录与生理样本各自带 `captured_at`，关联由消费方按时间窗完成。
- 理由：隐式 join 需要「一次运动从开始到结束」的区间，而现有 `workout_records` 只存 `captured_at` 一个点，没有 `startedAt`/`endedAt`。硬凑出来的关联就是假的，答辩问一句就崩。
- 因此本期产品口径只能是：**可穿戴数据已可采集、查询、聚合，并能与运动记录按时间对齐**。不得描述为「已经完成多模态融合评分」。下一轮若要真融合，先给 `workout_records` 加区间字段，再定义融合规则并给出验证方法。

## HTTP 路由（新增 6 条）

全部挂在现有 `HttpApiPlugin` 上，用同一套 `register()`。

| 方法 | 路径 | 认证 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/uploads` | 见配置 | 二进制 body；`Content-Type` 决定扩展名 | 201 `UploadReceipt` |
| `DELETE` | `/api/uploads/{id}` | 见配置 | — | 204 |
| `POST` | `/api/health-metrics` | 是 | `MetricIngestRequest` | 201 `MetricIngestResult` |
| `GET` | `/api/health-metrics` | 是 | `kind`、`from`、`to`、`limit`、`after` | 200 `MetricPage` |
| `GET` | `/api/health-metrics/summary` | 是 | `kind`（必填）、`from`、`to`、`bucket=hour\|day` | 200 `MetricSummary` |
| `DELETE` | `/api/health-metrics/{id}` | 是 | — | 204 |

要点：

- **上传路由的 `Content-Type` 是唯一扩展名来源**：`video/mp4 → .mp4`、`video/quicktime → .mov`、`video/x-m4v → .m4v`、`video/x-msvideo → .avi`、`video/webm → .webm`。不认 `Content-Type` 时回落到 `application/octet-stream` 并要求 `?ext=` 显式给出，两者都没有则 400。**不接受客户端文件名**，因此也不解析 `filename=`。
- `/api/health-metrics/summary` 必须注册在 `/api/health-metrics/{id}` 之前，或依赖静态段优先规则，不能把 `summary` 当 id。
- 可穿戴三条路由只在 `fitnessAuth` **与** `fitnessWearables` 都装载时注册；任一缺失则为 401/404，不半开。
- 上传路由只在 `fitnessUploads` 装载时注册。
- 未认证的受保护路由一律 401 `AUTH_UNAUTHENTICATED`，不泄漏资源是否存在。
- 响应体一律不含服务器本机绝对路径；`path` 是相对 `FITNESS_VIDEO_ROOT` 的 POSIX 风格路径。

### 响应形状

```
UploadReceipt {
  schemaVersion: '1.0',
  id: string,                 // UUID，即文件名主干
  path: string,               // 相对 FITNESS_VIDEO_ROOT，可直接喂给 POST /api/assessments
  name: string,               // 服务端文件名，username-free
  extension: string,          // '.mp4'
  bytes: number,
  sha256: string,             // 小写十六进制，64 字符
  anonymous: boolean,
  contentType: string,
  expiresAt: string           // ISO 8601，= mtime + TTL
}

MetricSample   { id, kind, unit, value, source, capturedAt, intervalMinutes? }
MetricIngestRequest { schemaVersion:'1.0', samples: MetricSample[] }
MetricIngestResult  { schemaVersion:'1.0', accepted, duplicates, ids: string[] }
MetricPage     { schemaVersion:'1.0', items: MetricSample[], nextCursor: string|null }
MetricSummary  { schemaVersion:'1.0', kind, unit, bucket, buckets: [{ bucketStart, count, min, max, average }] }
```

- `value` 是**解密后的明文数值**，只出现在响应里，不落库。
- `steps` 的 `intervalMinutes` 表示这条样本覆盖的时长（默认 1），用于把「区间累计」换算成速率；其他种类忽略该字段。

## 对 `http-api.ts` 的具体改动（接口线）

1. `HttpRoute` 增加可选 `body?: { readonly encoding: 'binary'; readonly limitBytes: number }`；缺省等于 `{ encoding: 'utf8', limitBytes: 1 MiB }`，即现有行为。
2. `HttpRequest` 增加可选 `bodyStream?: AsyncIterable<Uint8Array>`，仅 `encoding:'binary'` 的路由有值；此时 `body` 为空串。
3. `readBody` 拆成两条路径：utf8 保持现状；binary 直接返回 `request` 的可迭代流，**不缓冲、不设全局 1 MiB 上限**，上限由路由声明与服务层双重校验。
4. 请求体未被 handler 消费（提前 return 或抛错）时必须 `request.resume()` 排空，否则连接会挂住。
5. `collect()` 在 `entry.isDirectory()` 分支里跳过 `entry.name.startsWith('_')`。
6. 错误码到状态码的映射追加：`UPLOAD_INVALID` 400、`UPLOAD_TOO_LARGE` 413、`UPLOAD_NOT_FOUND` 404、`UPLOAD_UNAVAILABLE` 503、`METRIC_INVALID` 400、`METRIC_UNAVAILABLE` 503。

## 不做什么（本轮明确排除）

- 不做端侧（手机本地）MoveNet 推理。评分只有服务端一套来源，模型 id/sha256 与规则 policy 保持可追溯。
- 不做可穿戴数据进入评分或疲劳预警模型。需要先有区间化的运动记录和验证方法。
- 不做上传分片、断点续传、秒传。单文件 ≤512 MiB，一次传完。
- 不做上传的用户配额与总容量限制。暂存区靠 TTL 自然收敛；要配额得先有审计需求。
- 不改 `POST /api/assessments`、`/api/workouts*`、`/api/auth/*` 的任何既有语义。
- 不做前端页面改造。安卓客户端是独立仓库，不放进本仓库。

## 验证要求

- `pnpm typecheck` 与 `pnpm test` 全绿，贴真实数字。
- 上传面必须有自动化测试覆盖：正常落盘、超限 413 且不留半成品、`Content-Type` 不认识时 400、`_uploads` 不出现在 `GET /api/videos`、过期清理真的删掉旧文件、跨租户 `DELETE` 返回 404。
- 可穿戴面需要真实 PostgreSQL 集成测试（`pnpm test:database`）覆盖：写入→查询回读数值一致、`ON CONFLICT` 去重、RLS 跨租户隔离、超过 31 天窗返回 `METRIC_INVALID`、聚合桶边界。
- **不许把「流程跑通」写成「准确率达标」，也不许把「已可采集」写成「已完成多模态融合」。**
