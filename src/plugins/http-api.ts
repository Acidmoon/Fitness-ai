import { randomUUID } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Service, type Context } from 'cordis';
import { FitnessError, type FitnessErrorCode } from '../contracts.ts';
import type { FitnessAuth } from '../auth-contracts.ts';
import type { FitnessUsers } from '../user-contracts.ts';
import type { FitnessWorkoutHistory, WorkoutQuery } from '../history-contracts.ts';
import type { ExerciseQuery } from '../exercise-contracts.ts';
import {
  jsonResponse, type AssessmentResponse, type AuthPrincipal, type Disposable, type ErrorBody, type FitnessHttp,
  type HealthResponse, type HttpMethod, type HttpRequest, type HttpResponse, type HttpRoute,
  type VideoListItem, type VideoListResponse,
} from '../http-contracts.ts';

/** The HTTP entry point owns the listener; nothing else in the runtime binds a port. */
export interface HttpApiConfig {
  host?: string;
  port?: number;
  /** Overrides FITNESS_VIDEO_ROOT; intended for tests and explicit deployment wiring. */
  videoRoot?: string;
  /** Readiness hook, used by the resident entry point to print the bound address. */
  onListening?: (address: { host: string; port: number }) => void;
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const EXERCISES = ['squat', 'push-up'] as const;
const BODY_LIMIT = 1024 * 1024;
const MAX_RELATIVE_LENGTH = 4096;
const SCAN_BUDGET = 2000;
const SCAN_DEPTH = 4;
/** Record ids are UUIDs; a malformed id is a request error, not a lookup miss. */
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_QUERY_KEYS: readonly string[] = ['limit', 'after', 'exercise', 'from', 'to'];

/**
 * Status codes are part of the frozen HTTP contract. `INPUT_IO` maps to 404 for a
 * missing video; the unconfigured video root is a separate 503 raised by this plugin.
 */
const STATUS_BY_CODE: Readonly<Partial<Record<FitnessErrorCode, number>>> = {
  INVALID_ARGUMENTS: 400,
  INVALID_WORKOUT: 400,
  UNSUPPORTED_EXERCISE: 400,
  INVALID_EXERCISE_DATA: 400,
  VIDEO_INVALID: 400,
  USER_INVALID: 400,
  WORKOUT_INVALID: 400,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_UNAUTHENTICATED: 401,
  WORKOUT_NOT_FOUND: 404,
  INPUT_IO: 404,
  AUTH_CONFLICT: 409,
  USER_CONFLICT: 409,
  INSUFFICIENT_DATA: 422,
  AUTH_LOCKED: 429,
  INFERENCE_BUSY: 503,
  MODEL_UNAVAILABLE: 503,
  INFERENCE_FAILED: 500,
  POSE_INVALID: 500,
};

/**
 * `ErrorBody.error.code` is a plain string, so the HTTP layer may name its own
 * failures. `INTERNAL_ERROR` keeps an unexpected exception from being misreported
 * as a business or inference error; details only reach the server log.
 */
type HttpErrorCode = FitnessErrorCode | 'INTERNAL_ERROR';

interface RoutedFailure {
  readonly status: number;
  readonly code: HttpErrorCode;
  readonly message: string;
}

/** Routing and configuration failures that carry their own status code. */
class HttpError extends Error implements RoutedFailure {
  readonly status: number;
  readonly code: FitnessErrorCode;

  constructor(status: number, code: FitnessErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

interface StaticSegment {
  readonly kind: 'static';
  readonly value: string;
}

interface ParamSegment {
  readonly kind: 'param';
  readonly name: string;
}

type Segment = StaticSegment | ParamSegment;

interface CompiledRoute {
  readonly route: HttpRoute;
  readonly segments: readonly Segment[];
  /** Canonical identity of the route shape, used to reject duplicate registrations. */
  readonly key: string;
}

function bad(message: string): never {
  throw new HttpError(400, 'INVALID_ARGUMENTS', message);
}

function splitPath(pathname: string): string[] {
  if (pathname === '/' || pathname === '') return [];
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  try {
    return trimmed.split('/').slice(1).map(segment => decodeURIComponent(segment));
  } catch { bad('请求路径包含无效的百分号编码'); }
}

function compile(route: HttpRoute): CompiledRoute {
  if (!METHODS.includes(route.method)) throw new Error(`不支持的路由方法：${route.method}`);
  if (typeof route.path !== 'string' || !route.path.startsWith('/')) throw new Error(`路由路径必须以 / 开头：${route.path}`);
  if (typeof route.handler !== 'function') throw new Error(`路由 ${route.method} ${route.path} 缺少处理函数`);
  if (route.path === '/') return { route, segments: [], key: `${route.method} /` };
  const trimmed = route.path.endsWith('/') ? route.path.slice(0, -1) : route.path;
  const segments = trimmed.split('/').slice(1).map((segment): Segment => {
    if (!segment) throw new Error(`路由路径不能包含空段：${route.path}`);
    const parameter = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment);
    if (parameter) return { kind: 'param', name: parameter[1]! };
    if (segment.includes('{') || segment.includes('}')) throw new Error(`路由参数段必须写成 {name}：${route.path}`);
    return { kind: 'static', value: segment };
  });
  const names = new Set(segments.filter(segment => segment.kind === 'param').map(segment => segment.name));
  if (names.size !== segments.filter(segment => segment.kind === 'param').length) throw new Error(`路由不能重复使用参数名：${route.path}`);
  // Parameter names are part of the spelling but not of the route shape: two patterns
  // that differ only by parameter name always match the same requests.
  const key = `${route.method} ${segments.map(segment => (segment.kind === 'param' ? '{}' : segment.value)).join('/')}`;
  return { route, segments, key };
}

function matches(compiled: CompiledRoute, path: readonly string[]): Record<string, string> | undefined {
  if (compiled.segments.length !== path.length) return undefined;
  const params: Record<string, string> = {};
  for (let index = 0; index < compiled.segments.length; index++) {
    const segment = compiled.segments[index]!;
    const value = path[index]!;
    if (segment.kind === 'static') {
      if (segment.value !== value) return undefined;
    } else if (!value) {
      return undefined;
    } else {
      params[segment.name] = value;
    }
  }
  return params;
}

/** Static segments beat parameters; the first differing segment decides. */
function preceeds(left: CompiledRoute, right: CompiledRoute): boolean {
  const length = Math.min(left.segments.length, right.segments.length);
  for (let index = 0; index < length; index++) {
    const leftStatic = left.segments[index]!.kind === 'static' ? 1 : 0;
    const rightStatic = right.segments[index]!.kind === 'static' ? 1 : 0;
    if (leftStatic !== rightStatic) return leftStatic > rightStatic;
  }
  return false;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      request.resume();
      rejectBody(new HttpError(400, 'INVALID_ARGUMENTS', message));
    };
    request.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > BODY_LIMIT) return fail('请求体超过 1 MiB 限制');
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', cause => {
      if (settled) return;
      settled = true;
      rejectBody(cause);
    });
  });
}

function readHeaders(request: IncomingMessage): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('请求体必须是 JSON 对象');
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) bad(`未知字段：${key}`);
}

function text(value: unknown, name: string, max = MAX_RELATIVE_LENGTH): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) bad(`${name} 必须是 1–${max} 字符的非空字符串`);
  return value;
}

function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    bad(`${name} 必须是 ${min}–${max} 的整数`);
  }
  return value;
}

function member<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) bad(`${name} 必须是 ${values.join(' 或 ')}`);
  return value as T;
}

function integerParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) bad('查询参数必须是十进制非负整数');
  const value = Number(raw);
  if (value < min || value > max) bad(`查询参数必须在 ${min}–${max} 之间`);
  return value;
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export class HttpApiPlugin extends Service implements FitnessHttp {
  static provide = 'fitnessHttp';
  static inject = ['fitnessVideo', 'fitnessExercises', 'fitnessFiles'];

  private readonly config: HttpApiConfig;
  private readonly routes: CompiledRoute[] = [];
  private readonly server: Server;
  private readonly startedAt = Date.now();
  private closed = false;

  constructor(ctx: Context, config: HttpApiConfig = {}) {
    super(ctx, 'fitnessHttp');
    this.config = config;
    this.server = createServer((request, response) => { void this.handle(request, response); });
    ctx.effect(() => async () => { await this.close(); });
  }

  /** The listener is bound while the fiber loads, so readiness means "accepting requests". */
  async [Service.init](): Promise<void> {
    const host = this.config.host ?? process.env.FITNESS_HTTP_HOST ?? '127.0.0.1';
    const rawPort = this.config.port ?? Number(process.env.FITNESS_HTTP_PORT ?? 8787);
    if (!isLoopback(host)) {
      throw new Error(`拒绝绑定非回环地址 ${host}：不做鉴权的前提是只监听 127.0.0.1，改绑前需经 owner 拍板`);
    }
    if (!Number.isInteger(rawPort) || rawPort < 0 || rawPort > 65535) throw new Error('FITNESS_HTTP_PORT 必须是 0–65535 的整数');
    this.builtins();
    this.authRoutes();
    this.historyRoutes();
    const address = await this.listen(host, rawPort);
    this.config.onListening?.(address);
  }

  register(route: HttpRoute): Disposable {
    const compiled = compile(route);
    const duplicate = this.routes.find(item => item.key === compiled.key);
    if (duplicate) throw new Error(`路由已注册：${duplicate.route.method} ${duplicate.route.path}`);
    this.routes.push(compiled);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = this.routes.indexOf(compiled);
      if (index >= 0) this.routes.splice(index, 1);
    };
  }

  private listen(host: string, port: number): Promise<{ host: string; port: number }> {
    return new Promise((resolveListen, rejectListen) => {
      const fail = (error: Error) => {
        this.server.off('listening', ready);
        rejectListen(error);
      };
      const ready = () => {
        this.server.off('error', fail);
        const address = this.server.address();
        if (!address || typeof address === 'string') return fail(new Error('HTTP 服务未返回有效监听地址'));
        resolveListen({ host: address.address, port: (address as AddressInfo).port });
      };
      this.server.once('error', fail);
      this.server.once('listening', ready);
      this.server.listen(port, host);
    });
  }

  private async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.server.listening) return;
    // Destroying kept-alive sockets is part of the unload contract: no listener or
    // connection may outlive the plugin fiber.
    this.server.closeAllConnections();
    await new Promise<void>(resolveClose => { this.server.close(() => resolveClose()); });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const method = request.method ?? 'GET';
      const path = splitPath(url.pathname);
      const pathMatches = this.routes.filter(item => matches(item, path));
      if (!pathMatches.length) throw new HttpError(404, 'INVALID_ARGUMENTS', '没有匹配的路由');
      const candidates = pathMatches.filter(item => item.route.method === method);
      if (!candidates.length) {
        const allow = [...new Set(pathMatches.map(item => item.route.method))].join(', ');
        response.setHeader('allow', allow);
        throw new HttpError(405, 'INVALID_ARGUMENTS', `不支持的方法：${method}；允许 ${allow}`);
      }
      const selected = candidates.reduce((best, item) => (preceeds(item, best) ? item : best));
      const params = matches(selected, path) ?? {};
      const body = method === 'GET' ? '' : await readBody(request);
      const context: HttpRequest = {
        method: selected.route.method,
        path: url.pathname,
        url,
        params,
        query: url.searchParams,
        body,
        headers: readHeaders(request),
      };
      this.write(response, await selected.route.handler(context));
    } catch (error) {
      this.writeError(response, this.describe(error));
    }
  }

  private describe(error: unknown): RoutedFailure {
    if (error instanceof HttpError) return error;
    if (error instanceof FitnessError) {
      return { status: STATUS_BY_CODE[error.code] ?? 500, code: error.code, message: error.message };
    }
    this.ctx.logger.error(error);
    // Unexpected failures must not leak internals through the response.
    return { status: 500, code: 'INTERNAL_ERROR', message: '服务内部错误' };
  }

  private writeError(response: ServerResponse, failure: RoutedFailure): void {
    const body: ErrorBody = { error: { code: failure.code, message: failure.message } };
    this.write(response, jsonResponse(failure.status, body));
  }

  private write(response: ServerResponse, result: HttpResponse): void {
    if (response.headersSent || response.writableEnded) return;
    const headers: Record<string, string> = { ...result.headers };
    // 204 must not carry a body or framing headers for one.
    if (result.status === 204) {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    const body = result.body;
    const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    headers['content-type'] ??= typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    headers['content-length'] = String(payload.byteLength);
    headers['x-content-type-options'] ??= 'nosniff';
    response.writeHead(result.status, headers);
    response.end(payload);
  }

  private videoRoot(): string | undefined {
    const configured = this.config.videoRoot ?? process.env.FITNESS_VIDEO_ROOT;
    if (typeof configured !== 'string' || !configured.trim()) return undefined;
    return configured;
  }

  private async videoRootReal(): Promise<string> {
    const configured = this.videoRoot();
    if (!configured) throw new HttpError(503, 'INPUT_IO', '未配置视频根目录 FITNESS_VIDEO_ROOT');
    try {
      return await realpath(configured);
    } catch {
      throw new HttpError(503, 'INPUT_IO', '视频根目录不可用');
    }
  }

  private async resolveVideo(input: string): Promise<{ root: string; absolute: string; relative: string }> {
    const root = await this.videoRootReal();
    const candidate = isAbsolute(input) ? resolve(input) : resolve(root, input);
    // Containment is checked twice: lexically before touching the file system, so an
    // escaping path is a 400 even when it does not exist, and again after realpath so
    // a symbolic link cannot smuggle a file from outside the root.
    if (!this.inside(root, candidate)) throw new HttpError(400, 'INVALID_ARGUMENTS', '视频路径必须位于视频根目录内');
    let absolute: string;
    try {
      absolute = await realpath(candidate);
    } catch {
      throw new HttpError(404, 'INPUT_IO', '视频文件不存在或不可读');
    }
    if (!this.inside(root, absolute)) throw new HttpError(400, 'INVALID_ARGUMENTS', '视频路径必须位于视频根目录内');
    const inside = relative(root, absolute);
    if (!inside) throw new HttpError(400, 'INVALID_ARGUMENTS', '视频路径必须指向文件');
    return { root, absolute, relative: inside };
  }

  private inside(root: string, candidate: string): boolean {
    const inside = relative(root, candidate);
    return Boolean(inside) && !isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`);
  }

  private async collect(root: string): Promise<VideoListItem[]> {
    const items: VideoListItem[] = [];
    const queue: { directory: string; depth: number }[] = [{ directory: root, depth: 0 }];
    let budget = SCAN_BUDGET;
    while (queue.length && budget > 0) {
      const { directory, depth } = queue.shift()!;
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch { continue; }
      for (const entry of entries) {
        if (budget <= 0) break;
        if (entry.isDirectory()) {
          if (depth < SCAN_DEPTH) queue.push({ directory: join(directory, entry.name), depth: depth + 1 });
          continue;
        }
        // Symlinks are skipped while scanning: the file plugin resolves them, and a link
        // may point outside the root, which the listing must never expose.
        if (!entry.isFile()) continue;
        budget--;
        let file;
        try {
          file = await this.ctx.fitnessFiles.openVideo(join(directory, entry.name));
        } catch { continue; }
        const inside = relative(root, file.path);
        if (!inside || !this.inside(root, file.path)) continue;
        items.push({ path: inside.split(sep).join('/'), name: file.name, bytes: file.bytes });
      }
    }
    return items.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  }

  private health(): HttpResponse {
    const reflect = this.ctx.reflect;
    const services = Object.keys(reflect.props)
      .filter(name => reflect.props[name]?.type === 'service' && reflect.get(name, true) !== undefined)
      .sort();
    const body: HealthResponse = Object.freeze({
      schemaVersion: '1.0' as const,
      status: 'ok' as const,
      services: Object.freeze(services),
      uptimeMs: Date.now() - this.startedAt,
    });
    return jsonResponse(200, body);
  }

  private async videos(url: URL): Promise<HttpResponse> {
    const limit = integerParam(url.searchParams.get('limit'), 100, 1, 200);
    const offset = integerParam(url.searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const root = await this.videoRootReal();
    const items = await this.collect(root);
    const body: VideoListResponse = Object.freeze({
      schemaVersion: '1.0' as const,
      total: items.length,
      items: Object.freeze(items.slice(offset, offset + limit)),
    });
    return jsonResponse(200, body);
  }

  private exercises(url: URL): HttpResponse {
    const query: Record<string, unknown> = {};
    const textKeys = ['query', 'category', 'level', 'muscle', 'technique'] as const;
    for (const key of url.searchParams.keys()) {
      if (![...textKeys, 'equipment', 'offset', 'limit'].includes(key)) bad(`未知查询参数：${key}`);
    }
    for (const key of textKeys) {
      const value = url.searchParams.get(key);
      if (value !== null) query[key] = value;
    }
    const equipment = url.searchParams.get('equipment');
    if (equipment !== null) query.equipment = equipment === 'null' ? null : equipment;
    for (const key of ['offset', 'limit'] as const) {
      const value = url.searchParams.get(key);
      if (value !== null) query[key] = Number(value);
    }
    return jsonResponse(200, this.ctx.fitnessExercises.list(query as ExerciseQuery));
  }

  private async assessments(context: HttpRequest): Promise<HttpResponse> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context.body);
    } catch {
      bad('请求体必须是合法 JSON');
    }
    const body = object(parsed);
    exactKeys(body, ['path', 'exercise', 'targetRepetitions', 'sessionId', 'sampleFps']);
    const path = text(body.path, 'path');
    const exercise = member(body.exercise, EXERCISES, 'exercise');
    const targetRepetitions = integer(body.targetRepetitions, 'targetRepetitions', 1, 10_000);
    const sessionId = body.sessionId === undefined ? `http-${randomUUID()}` : text(body.sessionId, 'sessionId', 128);
    const sampleFps = body.sampleFps === undefined ? undefined : integer(body.sampleFps, 'sampleFps', 1, 30);

    const video = await this.resolveVideo(path);
    // The file plugin stays the single owner of video validation; this call also
    // supplies `bytes`, which the pose contract does not carry back.
    const file = await this.ctx.fitnessFiles.openVideo(video.absolute);
    const result = await this.ctx.fitnessVideo.assess({
      path: file.path,
      exercise,
      targetRepetitions,
      sessionId,
      ...(sampleFps === undefined ? {} : { sampleFps }),
    });
    const { poses, motion, assessment } = result;
    const response: AssessmentResponse = Object.freeze({
      schemaVersion: '1.0' as const,
      sessionId: assessment.sessionId,
      exercise: assessment.exercise,
      video: Object.freeze({
        name: file.name,
        bytes: file.bytes,
        width: poses.video.width,
        height: poses.video.height,
        sourceFps: poses.video.sourceFps,
        totalFrames: poses.video.totalFrames,
        decodedFrames: poses.video.decodedFrames,
        durationMs: poses.video.durationMs,
      }),
      model: Object.freeze({ id: poses.model.id, sha256: poses.model.sha256 }),
      sampling: Object.freeze({ requestedFps: poses.sampling.requestedFps, sampledFrames: poses.sampling.sampledFrames }),
      motion: Object.freeze({
        policy: motion.policy,
        side: motion.side,
        validFrames: motion.validFrames,
        rejectedFrames: motion.rejectedFrames,
        repetitions: Object.freeze(motion.repetitions.map(repetition => Object.freeze({
          startMs: repetition.startMs,
          bottomMs: repetition.bottomMs,
          endMs: repetition.endMs,
          minAngle: repetition.minAngle,
          maxAngle: repetition.maxAngle,
          rangeOfMotion: repetition.rangeOfMotion,
          stability: repetition.stability,
          durationMs: repetition.durationMs,
          confidence: repetition.confidence,
        }))),
        warnings: motion.warnings,
      }),
      score: assessment.score,
      advice: assessment.advice,
    });
    return jsonResponse(200, response);
  }

  /** `Authorization: Bearer` is the only accepted transport in this round. */
  private bearer(context: HttpRequest): string {
    const header = context.headers['authorization'];
    const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9_-]{1,512})$/i.exec(header) : null;
    if (!match) throw new HttpError(401, 'AUTH_UNAUTHENTICATED', '缺少有效的 Bearer 令牌');
    return match[1]!;
  }

  private jsonObject(context: HttpRequest): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(context.body);
    } catch {
      throw new HttpError(400, 'INVALID_ARGUMENTS', '请求体必须是合法 JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'INVALID_ARGUMENTS', '请求体必须是 JSON 对象');
    }
    return parsed as Record<string, unknown>;
  }

  private async authenticated(auth: FitnessAuth, context: HttpRequest): Promise<{ token: string; principal: AuthPrincipal }> {
    const token = this.bearer(context);
    try {
      return { token, principal: await auth.authenticate(token) };
    } catch (error) {
      // Protected routes never reveal whether the resource exists before authentication.
      if (error instanceof FitnessError && error.code === 'AUTH_UNAUTHENTICATED') {
        throw new HttpError(401, 'AUTH_UNAUTHENTICATED', '令牌无效、已过期或已吊销');
      }
      throw error;
    }
  }

  private async authRegister(auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    return jsonResponse(201, await auth.register({ ...this.jsonObject(context), schemaVersion: '1.0' }));
  }

  private async authLogin(auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    return jsonResponse(200, await auth.login({ ...this.jsonObject(context), schemaVersion: '1.0' }));
  }

  private async authLogout(auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    // Logout is idempotent: a revoked or unknown token is already logged out, so retrying
    // is not an error. Only a missing or malformed bearer header is rejected.
    await auth.logout(this.bearer(context));
    return { status: 204, body: '' };
  }

  private async authMe(auth: FitnessAuth, users: FitnessUsers, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    const user = await users.get(principal.tenantId, principal.userId);
    // A session whose account vanished is treated as unauthenticated, not as a 404.
    if (!user) throw new HttpError(401, 'AUTH_UNAUTHENTICATED', '会话对应的账号不可用');
    return jsonResponse(200, user);
  }

  private async authPassword(auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    await auth.changePassword(principal, { ...this.jsonObject(context), schemaVersion: '1.0' });
    return { status: 204, body: '' };
  }

  /** Identity fields are taken from the session only; refusing them here keeps the boundary explicit. */
  private clientBody(context: HttpRequest): Record<string, unknown> {
    const body = this.jsonObject(context);
    for (const key of ['tenantId', 'userId', 'actorId', 'verified', 'principal'] as const) {
      if (key in body) throw new HttpError(400, 'INVALID_ARGUMENTS', `请求体不得包含身份字段：${key}`);
    }
    return body;
  }

  private recordId(context: HttpRequest): string {
    const id = context.params['id'] ?? '';
    if (!RECORD_ID.test(id)) throw new HttpError(400, 'INVALID_ARGUMENTS', 'id 必须是 UUID');
    return id;
  }

  private historyQuery(context: HttpRequest): WorkoutQuery {
    for (const key of context.query.keys()) {
      if (!HISTORY_QUERY_KEYS.includes(key)) bad(`未知查询参数：${key}`);
    }
    const query: { limit: number; after?: string; exercise?: string; from?: string; to?: string } = {
      limit: integerParam(context.query.get('limit'), 20, 1, 100),
    };
    // Filters are forwarded verbatim: the history service owns cursor decoding and timestamp validation.
    for (const key of ['after', 'exercise', 'from', 'to'] as const) {
      const value = context.query.get(key);
      if (value !== null) query[key] = text(value, key, 512);
    }
    return query;
  }

  private async workoutList(history: FitnessWorkoutHistory, auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    return jsonResponse(200, await history.list(principal, this.historyQuery(context)));
  }

  private async workoutRecord(history: FitnessWorkoutHistory, auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    return jsonResponse(201, await history.record(principal, { ...this.clientBody(context), schemaVersion: '1.0' }));
  }

  private async workoutGet(history: FitnessWorkoutHistory, auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    const record = await history.get(principal, this.recordId(context));
    // A missing record and someone else's record must be the same answer, never distinguished.
    if (!record) throw new HttpError(404, 'WORKOUT_NOT_FOUND', '运动记录不存在');
    return jsonResponse(200, record);
  }

  private async workoutRemove(history: FitnessWorkoutHistory, auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    await history.remove(principal, this.recordId(context));
    return { status: 204, body: '' };
  }

  private async workoutStatistics(history: FitnessWorkoutHistory, auth: FitnessAuth, context: HttpRequest): Promise<HttpResponse> {
    const { principal } = await this.authenticated(auth, context);
    return jsonResponse(200, await history.statistics(principal));
  }

  /**
   * History routes need a session and the history service, so they exist only when the
   * user database and the history plugin are mounted. The static `statistics` pattern is
   * registered separately: routing prefers static segments, so it can never be read as an id.
   */
  private historyRoutes(): void {
    this.ctx.inject(['fitnessAuth', 'fitnessWorkoutHistory'], ctx => {
      const auth = ctx.fitnessAuth;
      const history = ctx.fitnessWorkoutHistory;
      ctx.effect(() => this.register({ method: 'GET', path: '/api/workouts', handler: context => this.workoutList(history, auth, context) }));
      ctx.effect(() => this.register({ method: 'POST', path: '/api/workouts', handler: context => this.workoutRecord(history, auth, context) }));
      ctx.effect(() => this.register({ method: 'GET', path: '/api/workouts/statistics', handler: context => this.workoutStatistics(history, auth, context) }));
      ctx.effect(() => this.register({ method: 'GET', path: '/api/workouts/{id}', handler: context => this.workoutGet(history, auth, context) }));
      ctx.effect(() => this.register({ method: 'DELETE', path: '/api/workouts/{id}', handler: context => this.workoutRemove(history, auth, context) }));
    });
  }

  /**
   * Account routes are contributed only when the auth plugin is present, so the
   * video-only entry point keeps working without a database.
   */
  private authRoutes(): void {
    this.ctx.inject(['fitnessAuth', 'fitnessUsers'], ctx => {
      const auth = ctx.fitnessAuth;
      const users = ctx.fitnessUsers;
      ctx.effect(() => this.register({ method: 'POST', path: '/api/auth/register', handler: context => this.authRegister(auth, context) }));
      ctx.effect(() => this.register({ method: 'POST', path: '/api/auth/login', handler: context => this.authLogin(auth, context) }));
      ctx.effect(() => this.register({ method: 'POST', path: '/api/auth/logout', handler: context => this.authLogout(auth, context) }));
      ctx.effect(() => this.register({ method: 'GET', path: '/api/auth/me', handler: context => this.authMe(auth, users, context) }));
      ctx.effect(() => this.register({ method: 'POST', path: '/api/auth/password', handler: context => this.authPassword(auth, context) }));
    });
  }

  /** Built-in routes are registered through the same mechanism external plugins use. */
  private builtins(): void {
    this.register({ method: 'GET', path: '/api/health', handler: () => this.health() });
    this.register({ method: 'GET', path: '/api/videos', handler: context => this.videos(context.url) });
    this.register({ method: 'GET', path: '/api/exercises', handler: context => this.exercises(context.url) });
    this.register({
      method: 'GET',
      path: '/api/exercises/{id}/standard',
      handler: context => jsonResponse(200, this.ctx.fitnessExercises.getStandard(context.params['id'] ?? '')),
    });
    this.register({ method: 'POST', path: '/api/assessments', handler: context => this.assessments(context) });
  }
}
