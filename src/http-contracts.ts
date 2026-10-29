import type { Disposable } from 'cordis';
import type { AuthPrincipal, AuthSession } from './auth-contracts.ts';
import type { AdviceResult, ScoreResult } from './contracts.ts';
import type { WorkoutPage, WorkoutRecord, WorkoutRecordInput, WorkoutStatistics, WorkoutSummary } from './history-contracts.ts';
import type { UserAccount, UserProfile } from './user-contracts.ts';

export type {
  Disposable, AuthPrincipal, AuthSession, WorkoutPage, WorkoutRecord, WorkoutRecordInput, WorkoutStatistics, WorkoutSummary,
};

/**
 * `POST /api/workouts` 的请求体：`schemaVersion` 由入口补齐，租户与用户只取自会话，
 * 客户端提交的 `tenantId`/`userId`/`actorId`/`verified` 一律 400。
 */
export type WorkoutRecordBody = Omit<WorkoutRecordInput, 'schemaVersion'>;

/** `POST /api/auth/register` 的请求体；`tenantId`、`userId` 一律不接受。 */
export interface RegisterBody {
  readonly identity: { readonly provider: string; readonly subject: string };
  readonly password: string;
  readonly profile: UserProfile;
}

/** `POST /api/auth/login` 的请求体。 */
export interface LoginBody {
  readonly identity: { readonly provider: string; readonly subject: string };
  readonly password: string;
}

/** `POST /api/auth/password` 的请求体。 */
export interface ChangePasswordBody {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/** 注册与登录的成功响应；令牌只在此处出现一次，数据库只存指纹。 */
export type AuthSessionResponse = AuthSession;

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
  /** 响应体按字节写出；JSON 用下面的 `jsonResponse` 组装。 */
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
  /**
   * 注册一条路由。同一方法 + 同一路径模式只能注册一次，重复注册抛错。
   * 返回同步注销函数，由注册方在卸载时调用。
   */
  register(route: HttpRoute): Disposable;
}

/** 非 2xx 响应的统一信封。 */
export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

/** 供需要返回 JSON 的路由使用。 */
export function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export interface HealthResponse {
  readonly schemaVersion: '1.0';
  readonly status: 'ok';
  readonly services: readonly string[];
  readonly uptimeMs: number;
}

export interface VideoListItem {
  /** 相对 `FITNESS_VIDEO_ROOT` 的路径；绝不含本机绝对路径。 */
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
}

export interface VideoListResponse {
  readonly schemaVersion: '1.0';
  readonly total: number;
  readonly items: readonly VideoListItem[];
}

/** `POST /api/assessments` 的请求体。 */
export interface AssessmentRequestBody {
  readonly path: string;
  readonly exercise: 'squat' | 'push-up';
  readonly targetRepetitions: number;
  readonly sessionId?: string;
  readonly sampleFps?: number;
}

/** `POST /api/assessments` 的成功响应；字段直接来自视频评价结果，页面不得重算。 */
export interface AssessmentResponse {
  readonly schemaVersion: '1.0';
  readonly sessionId: string;
  readonly exercise: string;
  readonly video: {
    readonly name: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly sourceFps: number;
    readonly totalFrames: number;
    readonly decodedFrames: number;
    readonly durationMs: number;
  };
  readonly model: { readonly id: string; readonly sha256: string };
  readonly sampling: { readonly requestedFps: number; readonly sampledFrames: number };
  readonly motion: {
    readonly policy: { readonly id: string; readonly version: string; readonly kind: string };
    readonly side: 'left' | 'right';
    readonly validFrames: number;
    readonly rejectedFrames: number;
    readonly repetitions: readonly {
      readonly startMs: number;
      readonly bottomMs: number;
      readonly endMs: number;
      readonly minAngle: number;
      readonly maxAngle: number;
      readonly rangeOfMotion: number;
      readonly stability: number;
      readonly durationMs: number;
      readonly confidence: number;
    }[];
    readonly warnings: readonly string[];
  };
  readonly score: ScoreResult;
  readonly advice: AdviceResult;
}

declare module 'cordis' {
  interface Context {
    fitnessHttp: FitnessHttp;
  }
}
