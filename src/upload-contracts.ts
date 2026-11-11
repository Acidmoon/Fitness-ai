import type {} from 'cordis';
import type { AuthPrincipal } from './auth-contracts.ts';

/**
 * 视频上传契约。
 *
 * 这一层只做一件事：把一段视频字节安全地落到 `FITNESS_VIDEO_ROOT/_uploads` 下，
 * 并返回一个能从既有 `path` 契约直接使用的相对路径。它不解析视频、不抽取骨架、
 * 不参与评分——那些仍分别归 `fitnessFiles`、`fitnessPose`、`fitnessVideo`。
 *
 * `root` 的唯一来源是 `FITNESS_VIDEO_ROOT`。装配方若给 HTTP 入口传了
 * `HttpApiConfig.videoRoot` 覆盖，必须同时把同一个值传进本插件，否则上传会落到
 * 一个目录、评估去另一个目录找。这条约束无法在类型上表达，只能写在这里。
 */

/** 与 `LocalFilePlugin.openVideo` 的白名单严格一致；新增格式必须两边同时改。 */
export type UploadExtension = '.mp4' | '.mov' | '.m4v' | '.avi' | '.webm';

export const UPLOAD_EXTENSIONS: readonly UploadExtension[] = Object.freeze(['.mp4', '.mov', '.m4v', '.avi', '.webm']);

/** 下划线前缀表示系统保留目录；`GET /api/videos` 会跳过它。 */
export const UPLOAD_DIRECTORY = '_uploads';
export const UPLOAD_ANONYMOUS_DIRECTORY = '_anonymous';

export interface UploadReceipt {
  readonly schemaVersion: '1.0';
  /** UUID v4，同时是文件主干名。 */
  readonly id: string;
  /** 相对 `FITNESS_VIDEO_ROOT` 的 POSIX 风格路径，可直接用于 `POST /api/assessments` 的 `path`。 */
  readonly path: string;
  readonly name: string;
  readonly extension: UploadExtension;
  readonly bytes: number;
  /** 小写十六进制，64 字符。内容指纹，用于证明同一路径下的文件是否变过。 */
  readonly sha256: string;
  /** 未认证上传时为 true；仅供本地演示，不得用于部署。 */
  readonly anonymous: boolean;
  readonly contentType: string;
  /** `mtime + FITNESS_UPLOAD_TTL_MINUTES`，ISO 8601。 */
  readonly expiresAt: string;
}

export interface UploadRequest {
  /**
   * 已验证的会话主体。为 `null` 表示未认证上传（`FITNESS_UPLOAD_REQUIRE_AUTH=false`），
   * 文件落到 `_anonymous/`。租户与用户标识只能来自这里，不接受请求体或查询串。
   */
  readonly owner: AuthPrincipal | null;
  readonly extension: UploadExtension;
  readonly contentType: string;
  /** `Content-Length`。只作预检，最终以实写字节为准。 */
  readonly declaredBytes: number;
  readonly chunks: AsyncIterable<Uint8Array>;
}

export interface UploadRemoveRequest {
  readonly owner: AuthPrincipal | null;
  readonly id: string;
}

export interface FitnessUploads {
  receive(request: UploadRequest): Promise<UploadReceipt>;
  /**
   * 删除自己的一个暂存文件。不存在、已过期、属于别的租户/用户，一律
   * `UPLOAD_NOT_FOUND`，调用方无法据此判断文件是否存在。
   */
  remove(request: UploadRemoveRequest): Promise<void>;
  /**
   * 惰性清理：删除超过 TTL 的暂存文件，返回删除数量。在每次成功上传前调用。
   * 清理失败只记日志，不抛错、不阻断上传。
   */
  sweep(): Promise<number>;
  /** 暂存区根目录绝对路径；未配置 `FITNESS_VIDEO_ROOT` 或不可写时为 `undefined`。 */
  root(): string | undefined;
}

/**
 * 从 Content-Type 推导扩展名。上传不接受客户端文件名，因此这里也是唯一的格式来源。
 * 认不出来时返回 undefined，由调用方决定是 400 还是要求显式 \`?ext=\`。
 */
export function extensionFor(contentType: string): UploadExtension | undefined {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  switch (type) {
    case 'video/mp4': return '.mp4';
    case 'video/quicktime': return '.mov';
    case 'video/x-m4v': return '.m4v';
    case 'video/x-msvideo': return '.avi';
    case 'video/webm': return '.webm';
    default: return undefined;
  }
}

declare module 'cordis' {
  interface Context {
    fitnessUploads: FitnessUploads;
  }
}
