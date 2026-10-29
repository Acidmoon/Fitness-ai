# 用户身份与运动历史契约（冻结）

本契约在 `bae663f` 基线上冻结。接口线与数据线共同遵守；改契约先回到主管，再改实现。

## 边界（来自 AGENTS.md，最高优先）

- **认证与授权不是数据库插件的职责**。`UserDatabasePlugin` 不校验密码、不签发 Token、不做授权策略；密码验证、会话令牌、登录流程由独立的认证插件 `AuthPlugin`（服务名 `fitnessAuth`）承担。
- **不信任客户端提交的 `tenantId`、`actorId`、`verified`**。租户与用户身份只能来自已验证的会话行。
- 个人资料与身份标识只经 `fitnessUserDataProtection` 加密。**登录凭据与运动历史明细同样不存明文**。
- 日志、审计、outbox、幂等回执不保存明文密码、Token 或资料。
- 同一作用域一个服务名只有一个提供方。不新增第二套注册机制。

## 新增服务与文件

| 服务 | 文件 | 职责 |
| --- | --- | --- |
| `fitnessAuth` | `src/plugins/auth.ts` | 注册、登录、登出、Token 校验、改密、会话吊销 |
| `fitnessWorkoutHistory` | `src/plugins/workout-history.ts` | 运动历史的写入、分页查询、详情、删除、统计 |

契约文件（由主管冻结，两条线只读，**不许各自复制**）：

- `src/auth-contracts.ts`（已落盘）
- `src/history-contracts.ts`（已落盘）

## 数据归属与注册原子性

**`credentials` 与 `sessions` 归 `AuthPlugin` 所有，`workout_records` 归 `WorkoutHistoryPlugin` 所有。** 三个插件都通过 `fitnessDatabase` 在自己的事务里读写自己的表，共用 `fitness_users` 模式与同一套 RLS 策略。

为什么不让 `fitnessUsers` 顺带存凭据：现有 `UserDatabasePlugin` 的幂等回执、审计事件、outbox 是一套经过 21 项集成测试验证的机制，往里加凭据要同时扩 `UserChangeKind`、审计表约束、回执字段，改动面大且风险高；而「数据库插件不承担密码校验」本身就是硬规则，凭据存储放在认证插件侧更贴合边界。

**注册不是单事务，而是补偿式流程**，这一点必须诚实记录：

1. `AuthPlugin` 先校验输入、算好密码哈希。
2. 调 `fitnessUsers.create()` 建账号＋资料＋身份（它自己的事务，原子）。
3. 在自己的事务里写 `credentials`。
4. 若第 3 步失败，调 `fitnessUsers.erase()` 撤销刚建的账号，再返回错误。

失败窗口内可能残留一个「有账号、无凭据」的账号，它无法登录，且会被第 4 步清掉。审计里会留下 `user.created` 与 `user.erased` 两条事件，这是正确的痕迹，不是 bug。本轮不做分布式事务，也不假装它原子。

## 新增错误码

`src/contracts.ts` 的 `FitnessErrorCode` 追加 6 个成员（只追加，不改既有语义）：

| 错误码 | 含义 | HTTP |
| --- | --- | --- |
| `AUTH_INVALID_CREDENTIALS` | 身份或密码错误（**不区分是哪一个错**，防枚举） | 401 |
| `AUTH_UNAUTHENTICATED` | 无 Token、Token 无效、已过期或已吊销 | 401 |
| `AUTH_LOCKED` | 连续失败次数超限，暂时锁定 | 429 |
| `AUTH_CONFLICT` | 该登录身份已被注册 | 409 |
| `WORKOUT_INVALID` | 运动历史写入或查询参数不合法 | 400 |
| `WORKOUT_NOT_FOUND` | 运动历史不存在或不属于该用户 | 404 |

## 配置项（新增到 `.env.example`）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `FITNESS_TENANT_ID` | 启用认证时必填 | 单租户部署的租户 UUID。未配置时认证插件启动失败，不回退默认租户 |
| `FITNESS_AUTH_SESSION_HOURS` | 否，默认 `168` | 会话有效期，1–720 小时 |
| `FITNESS_AUTH_MAX_ATTEMPTS` | 否，默认 `5` | 连续失败次数上限，1–20 |
| `FITNESS_AUTH_LOCK_MINUTES` | 否，默认 `15` | 锁定时长，1–1440 分钟 |

## 密码与令牌

### 密码

- 用 **Node 内置 `node:crypto` 的 `scrypt`**，不新增 npm 依赖。
- 参数固定为 `N=16384, r=8, p=1, keylen=64`，每个密码独立 16 字节随机盐。
- 存储格式：`scrypt$16384$8$1$<base64url salt>$<base64url hash>`。只存这个串，不存明文、不存可逆密文。
- 长度 10–128 个码点；拒绝全空白；不做大小写/符号组合强制（按 NIST 建议）。
- 校验用 `crypto.timingSafeEqual`，长度不等时也走等价路径，不提前返回。
- **失败一律返回 `AUTH_INVALID_CREDENTIALS`**，不区分「用户不存在」与「密码错」。

### 会话令牌

- 32 字节随机数，base64url 编码后返回给调用方。
- 数据库**只存** `fingerprint(['session-token', tenantId], token)` 的 HMAC-SHA-256 指纹，不存令牌原文。
- 有效期由 `FITNESS_AUTH_SESSION_HOURS` 决定；过期、吊销后 `authenticate` 一律返回 `AUTH_UNAUTHENTICATED`。
- 传输方式：`Authorization: Bearer <token>`。本轮不做 Cookie，理由写进 README（便于将来 Android 复用同一契约）。
- 登出即吊销当前会话；`revokeAll` 吊销该用户全部会话（用于账号停用）。

### 登录失败限制

- 每次失败递增 `failed_attempts`；达到 `FITNESS_AUTH_MAX_ATTEMPTS` 时写入 `locked_until = now() + FITNESS_AUTH_LOCK_MINUTES`，并返回 `AUTH_LOCKED`。
- 成功登录清零 `failed_attempts` 与 `locked_until`。
- 锁定期间即使密码正确也返回 `AUTH_LOCKED`。

### 实现确认的补充语义（接口线维护）

以下几处冻结时没有写细，实现时按此执行，已由测试覆盖：

- **密码长度常量导出**：`src/auth-contracts.ts` 导出 `AUTH_PASSWORD_MIN_CODEPOINTS = 10`、`AUTH_PASSWORD_MAX_CODEPOINTS = 128`，客户端与插件共用同一份，不在页面里另写一份。
- **`logout` 幂等**：未知、格式不合法或已吊销的令牌都视为成功，不报错、不回显任何状态，避免用登出接口探测令牌是否存在。HTTP 路由保持一致：只拒绝缺失或畸形的 `Authorization` 头（401），已吊销令牌重复登出仍返回 `204`。
- **`changePassword` 的失败路径**：当前密码不匹配返回 `AUTH_INVALID_CREDENTIALS`，**不计入**登录失败锁定次数（否则改密接口会变成一条可触发锁定的路径）；成功时只吊销该用户其他会话，`principal.sessionId` 保持可用。
- **`authenticate` 要求账号 `active`**：停用（`suspended`）或已删除（`deleted`）账号的旧令牌一律 `AUTH_UNAUTHENTICATED`，不返回账号状态细节。
- **`revokeAll` 是单租户操作**：传入非配置租户返回 `TENANT_NOT_FOUND`，不做跨租户批量吊销。
- **锁定是「连续失败」计数**：`locked_until` 到期后下一次失败先把 `failed_attempts` 归零再计 1，用户重新获得 `FITNESS_AUTH_MAX_ATTEMPTS` 次尝试，而不是每个锁定周期只剩一次机会。锁定期间凭据不受影响，登录入口在密码校验前就返回 `AUTH_LOCKED`。
- **认证路由是可选的**：只有装载 `fitnessAuth` 时 HTTP 入口才注册 `/api/auth/*`；未装载时这些路径为 404，视频模式不依赖数据库。`204` 响应不带响应体与 framing 头。
- **真实库验证**：`tests/integration/http-auth.test.ts` 在隔离 PostgreSQL 上跑通注册 → 登录 → `me` → 登出、锁定与到期重计、会话过期与吊销、重复身份、跨用户历史隔离，并验证 5 条历史路由真实装载后可用。SQL 语法、参数类型推断、`set_config` 下的 RLS 行为与 `JOIN accounts` 过滤只有这一层能证明，假库单测不能替代。
- **历史路由已实现（5 条）**：同样只在 `fitnessAuth` 与 `fitnessWorkoutHistory` 都装载时才注册，未装载时 `/api/workouts*` 为 404。路由层只做边界校验：查询参数白名单（未知参数 400）、`limit` 1–100 默认 20、`id` 必须是 UUID（格式错 400，查不到 404 `WORKOUT_NOT_FOUND`）、请求体拒绝 `tenantId`/`userId`/`actorId`/`verified`、`schemaVersion` 由服务端补齐。`after` 游标原样转发，解码、过期与篡改判定归历史服务。

## 数据库模式（迁移 002 与 003）

均由**数据线**在 `src/data/user-database/` 下新建，并在 `src/user-migrations.ts` 的迁移列表中按序追加。已应用的迁移不改。

### `002-auth.sql`

```sql
CREATE TABLE fitness_users.credentials (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%' AND octet_length(password_hash) <= 512),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);

CREATE TABLE fitness_users.sessions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_lookup varchar(64) NOT NULL CHECK (token_lookup ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT sessions_token_unique UNIQUE (tenant_id, token_lookup),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX sessions_user ON fitness_users.sessions(tenant_id, user_id, created_at DESC);
```

### `003-workout-history.sql`

```sql
CREATE TABLE fitness_users.workout_records (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id varchar(128) NOT NULL CHECK (length(btrim(session_id)) > 0),
  exercise varchar(64) NOT NULL CHECK (length(btrim(exercise)) > 0),
  target_repetitions integer NOT NULL CHECK (target_repetitions BETWEEN 1 AND 10000),
  observed_repetitions integer NOT NULL CHECK (observed_repetitions BETWEEN 0 AND 10000),
  total_score numeric(5,2) NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  sealed_detail text NOT NULL CHECK (sealed_detail LIKE 'v1.%' AND octet_length(sealed_detail) <= 100000),
  source varchar(8) NOT NULL CHECK (source IN ('video', 'json')),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES fitness_users.accounts(tenant_id, id)
);
CREATE INDEX workout_records_user_time ON fitness_users.workout_records(tenant_id, user_id, captured_at DESC, id DESC);
```

要点：

- 两张表的 `credentials`、`sessions`、`workout_records` 都**必须** `ENABLE` + `FORCE ROW LEVEL SECURITY`，策略与其他用户表一致的租户隔离。
- **运动历史的 `score` 与 `advice` 明细整体加密**存进 `sealed_detail`（AAD 含 `tenantId`、`userId`、记录 `id`）。明文列只保留可索引的聚合值：动作、目标次数、观测次数、总分、来源、时间。理由：健康数据属于个人数据，不落明文。
- `total_score` 必须先校验与 `score.total` 一致，不允许两处不同。
- 运行账号权限：`GRANT SELECT, INSERT, UPDATE, DELETE ON fitness_users.credentials, fitness_users.sessions, fitness_users.workout_records`。
- `assertUserDatabase` 的表数与强制 RLS 检查从 7 张更新为 10 张：`tenants`、`accounts`、`profiles`、`identities`、`mutation_receipts`、`audit_events`、`outbox`、`credentials`、`sessions`、`workout_records`。启动时校验全部 10 张都必须强制 RLS，少一张就拒绝启动。

## HTTP 路由（新增，接口线实现）

全部挂在现有 `HttpApiPlugin` 上，用同一套 `register()`。认证走 `Authorization: Bearer`。

| 方法 | 路径 | 认证 | 请求体 / 查询 | 响应 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/register` | 否 | `{ identity:{provider,subject}, password, profile:{displayName,locale,timeZone,avatarAssetId} }` | 201 `{ token, expiresAt, user }` |
| `POST` | `/api/auth/login` | 否 | `{ identity:{provider,subject}, password }` | 200 `{ token, expiresAt, user }` |
| `POST` | `/api/auth/logout` | 是 | 空 | 204 |
| `GET` | `/api/auth/me` | 是 | — | 200 `UserAccount` |
| `POST` | `/api/auth/password` | 是 | `{ currentPassword, newPassword }` | 204，并吊销该用户其他会话 |
| `GET` | `/api/workouts` | 是 | `limit`(1–100，默认 20)、`after`、`exercise`、`from`、`to` | 200 `WorkoutPage` |
| `POST` | `/api/workouts` | 是 | `WorkoutRecordInput` | 201 `WorkoutRecord` |
| `GET` | `/api/workouts/{id}` | 是 | — | 200 `WorkoutRecord` |
| `DELETE` | `/api/workouts/{id}` | 是 | — | 204 |
| `GET` | `/api/workouts/statistics` | 是 | — | 200 `WorkoutStatistics` |

要点：

- **路由不得接受请求体里的 `tenantId` / `userId`**。两者一律从 `fitnessAuth.authenticate(token)` 得到的 `AuthPrincipal` 取。
- `/api/workouts/statistics` 必须注册在 `/api/workouts/{id}` 之前或靠静态段优先规则生效，不能把 `statistics` 当 id。
- `POST /api/assessments` 本轮**不自动写历史**：现有契约没有身份，擅自改它的语义会破坏既有调用方。改为新增可选字段不建议——留到下一轮由 owner 决定。历史由 `POST /api/workouts` 显式写入。
- 未认证的受保护路由一律 401 `AUTH_UNAUTHENTICATED`，不泄漏资源是否存在。
- `GET /api/workouts/{id}` 与 `DELETE /api/workouts/{id}` 在记录不存在、属于其他租户或其他用户时一律返回 404 `WORKOUT_NOT_FOUND`；`FitnessWorkoutHistory.get` 返回非可空记录，不返回 `null`，同一错误码覆盖「不存在」与「不可见」，调用方无法据此区分记录是否存在。

## 不做什么（本轮明确排除）

- 不做邮箱/短信验证码、找回密码、第三方 OAuth。注册即生效，`verified_at` 记为注册时间。
- 不做角色与权限系统（`admin`/`coach` 等），本轮只有「已登录用户」一种身份。
- 不做刷新令牌、不做多设备会话管理界面。`revokeAll` 只在改密和账号停用时调用。
- 不做前端页面改造。登录页、历史列表页留到下一轮。
- 不改 `POST /api/assessments` 的既有语义。

## 验证要求

- 两条线各自 `pnpm check` 全绿并贴真实数字。
- 数据线额外跑 `pnpm test:database`（隔离 PostgreSQL），覆盖：密码哈希不可逆、会话过期与吊销、登录失败锁定、RLS 跨租户隔离、历史明细加密可解密、分页游标、统计聚合。
- 接口线额外验证：注册→登录→带 Token 写历史→列表→详情→删除全链路；未带 Token 全部 401；A 用户拿不到 B 用户历史。
- 不许把「流程跑通」写成「安全已审计」，也不许声称密码方案达到某个安全强度认证。
