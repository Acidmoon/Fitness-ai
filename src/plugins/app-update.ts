import { readFile, stat } from 'node:fs/promises';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import { type HttpRequest, type HttpResponse } from '../http-contracts.ts';
import type { AndroidReleaseInfo, FitnessAppUpdates } from '../app-update-contracts.ts';

/**
 * Android in-app update discovery plugin (`fitnessAppUpdates`).
 *
 * Reads a server-managed JSON release manifest pointed to by
 * `FITNESS_APP_RELEASES_FILE` (or explicit plugin config), validates every
 * field strictly (HTTPS-only `apkUrl`), caches by file `(mtimeMs, size)` for
 * zero-restart live reloads, and registers public `GET /api/app/android/latest`
 * on the shared HTTP entry point.
 */

export interface AppUpdateConfig {
  /** Overrides `FITNESS_APP_RELEASES_FILE`; intended for tests and explicit wiring. */
  readonly releasesFile?: string;
}

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_VERSION_CODE = 2_147_483_647;
const MAX_APK_BYTES = 2_147_483_647;
const MAX_RELEASE_NOTES = 32;
const MAX_NOTE_LENGTH = 500;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const POSITIVE_INT = /^[1-9][0-9]*$/;
const ALLOWED_KEYS: readonly string[] = [
  'schemaVersion',
  'versionCode',
  'versionName',
  'minSupportedVersionCode',
  'apkUrl',
  'sha256',
  'bytes',
  'releaseNotes',
  'publishedAt',
  'mandatory',
];

function invalidManifest(message: string): never {
  throw new FitnessError('APP_UPDATE_INVALID', message);
}

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    invalidManifest(`发布清单字段 ${field} 格式无效`);
  }
  return value.trim();
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalidManifest(`发布清单字段 ${field} 必须是 ${min}–${max} 的整数`);
  }
  return value;
}

function httpsUrl(value: unknown): string {
  const raw = cleanText(value, 'apkUrl', 2048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    invalidManifest('发布清单字段 apkUrl 必须是合法 URL');
  }
  if (parsed.protocol !== 'https:') {
    invalidManifest('发布清单字段 apkUrl 仅允许 HTTPS 协议');
  }
  if (parsed.username || parsed.password || !parsed.hostname) {
    invalidManifest('发布清单字段 apkUrl 不得包含凭据且必须有主机名');
  }
  return raw;
}

export function parseAndroidReleaseManifest(value: unknown): AndroidReleaseInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidManifest('Android 发布清单必须是 JSON 对象');
  }
  const data = value as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.includes(key)) invalidManifest(`Android 发布清单包含未声明字段：${key}`);
  }
  if (data.schemaVersion !== '1.0') invalidManifest('Android 发布清单仅支持 schemaVersion 1.0');
  const versionCode = integer(data.versionCode, 'versionCode', 1, MAX_VERSION_CODE);
  const versionName = cleanText(data.versionName, 'versionName', 64);
  const minSupportedVersionCode = integer(data.minSupportedVersionCode, 'minSupportedVersionCode', 1, versionCode);
  const apkUrl = httpsUrl(data.apkUrl);
  if (typeof data.sha256 !== 'string' || !SHA256_HEX.test(data.sha256)) {
    invalidManifest('发布清单字段 sha256 必须是 64 位十六进制串');
  }
  const sha256 = data.sha256.toLowerCase();
  const bytes = integer(data.bytes, 'bytes', 1, MAX_APK_BYTES);
  if (!Array.isArray(data.releaseNotes) || data.releaseNotes.length > MAX_RELEASE_NOTES) {
    invalidManifest(`发布清单字段 releaseNotes 必须是最多 ${MAX_RELEASE_NOTES} 项的数组`);
  }
  const releaseNotes = Object.freeze(
    data.releaseNotes.map((item, idx) => cleanText(item, `releaseNotes[${idx}]`, MAX_NOTE_LENGTH)),
  );
  if (typeof data.publishedAt !== 'string' || data.publishedAt.length > 40
    || !ISO_TIMESTAMP.test(data.publishedAt) || Number.isNaN(Date.parse(data.publishedAt))) {
    invalidManifest('发布清单字段 publishedAt 必须是 ISO 8601 时间');
  }
  const publishedAt = new Date(data.publishedAt).toISOString();
  if (typeof data.mandatory !== 'boolean') {
    invalidManifest('发布清单字段 mandatory 必须是布尔值');
  }
  return Object.freeze({
    schemaVersion: '1.0' as const,
    versionCode,
    versionName,
    minSupportedVersionCode,
    apkUrl,
    sha256,
    bytes,
    releaseNotes,
    publishedAt,
    mandatory: data.mandatory,
  });
}

interface CachedManifest {
  readonly filePath: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly release: AndroidReleaseInfo;
}

export class AppUpdatePlugin extends Service implements FitnessAppUpdates {
  static provide = 'fitnessAppUpdates';

  private readonly config: AppUpdateConfig;
  private cached: CachedManifest | undefined;

  constructor(ctx: Context, config: AppUpdateConfig = {}) {
    super(ctx, 'fitnessAppUpdates');
    this.config = config;
    ctx.effect(() => () => { this.cached = undefined; });
    ctx.inject(['fitnessHttp'], sub => {
      sub.effect(() => sub.fitnessHttp.register({
        method: 'GET',
        path: '/api/app/android/latest',
        handler: request => this.handleLatestAndroid(request),
      }));
    });
  }

  private resolveFilePath(): string {
    const raw = this.config.releasesFile ?? process.env.FITNESS_APP_RELEASES_FILE;
    if (typeof raw !== 'string' || !raw.trim()) {
      this.cached = undefined;
      throw new FitnessError('APP_UPDATE_UNAVAILABLE', '未配置 Android 发布清单文件 FITNESS_APP_RELEASES_FILE');
    }
    return raw.trim();
  }

  private async loadManifest(): Promise<AndroidReleaseInfo> {
    const filePath = this.resolveFilePath();
    let info;
    try {
      info = await stat(filePath);
    } catch (error) {
      this.cached = undefined;
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        throw new FitnessError('APP_UPDATE_NOT_FOUND', '未找到 Android 发布清单');
      }
      throw new FitnessError('APP_UPDATE_INVALID', '无法读取 Android 发布清单');
    }
    if (!info.isFile() || info.size <= 0 || info.size > MAX_MANIFEST_BYTES) {
      this.cached = undefined;
      throw new FitnessError('APP_UPDATE_INVALID', 'Android 发布清单文件大小无效');
    }
    if (this.cached && this.cached.filePath === filePath
      && this.cached.mtimeMs === info.mtimeMs && this.cached.size === info.size) {
      return this.cached.release;
    }

    let rawText: string;
    try {
      rawText = await readFile(filePath, 'utf8');
    } catch (error) {
      this.cached = undefined;
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        throw new FitnessError('APP_UPDATE_NOT_FOUND', '未找到 Android 发布清单');
      }
      throw new FitnessError('APP_UPDATE_INVALID', '无法读取 Android 发布清单');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.cached = undefined;
      throw new FitnessError('APP_UPDATE_INVALID', 'Android 发布清单不是合法 JSON');
    }
    try {
      const release = parseAndroidReleaseManifest(parsed);
      this.cached = { filePath, mtimeMs: info.mtimeMs, size: info.size, release };
      return release;
    } catch (error) {
      this.cached = undefined;
      throw error;
    }
  }

  async latestAndroid(currentVersionCode?: number): Promise<AndroidReleaseInfo> {
    if (currentVersionCode !== undefined) {
      if (typeof currentVersionCode !== 'number' || !Number.isInteger(currentVersionCode)
        || currentVersionCode < 1 || currentVersionCode > MAX_VERSION_CODE) {
        throw new FitnessError('INVALID_ARGUMENTS', `currentVersionCode 必须是 1–${MAX_VERSION_CODE} 的整数`);
      }
    }
    const release = await this.loadManifest();
    if (currentVersionCode === undefined) return release;
    return Object.freeze({
      ...release,
      updateAvailable: release.versionCode > currentVersionCode,
    });
  }

  private async handleLatestAndroid(request: HttpRequest): Promise<HttpResponse> {
    let seenCurrent = false;
    let currentVersionCode: number | undefined;
    for (const [key, raw] of request.query) {
      if (key !== 'currentVersionCode') {
        throw new FitnessError('INVALID_ARGUMENTS', `未知查询参数：${key}`);
      }
      if (seenCurrent) {
        throw new FitnessError('INVALID_ARGUMENTS', '查询参数重复：currentVersionCode');
      }
      seenCurrent = true;
      if (!POSITIVE_INT.test(raw)) {
        throw new FitnessError('INVALID_ARGUMENTS', 'currentVersionCode 必须是正整数');
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_VERSION_CODE) {
        throw new FitnessError('INVALID_ARGUMENTS', `currentVersionCode 必须是 1–${MAX_VERSION_CODE} 的整数`);
      }
      currentVersionCode = parsed;
    }
    const info = await this.latestAndroid(currentVersionCode);
    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body: JSON.stringify(info),
    };
  }
}
