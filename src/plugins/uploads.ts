import { createHash, randomUUID } from 'node:crypto';
import { open, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import {
  UPLOAD_ANONYMOUS_DIRECTORY, UPLOAD_DIRECTORY,
  type FitnessUploads, type UploadExtension, type UploadReceipt, type UploadRemoveRequest, type UploadRequest,
} from '../upload-contracts.ts';

/**
 * 上传面：把字节安全落地，交出一个能被 `fitnessFiles.openVideo` 接受、也能直接
 * 当作 `POST /api/assessments` 的 `path` 使用的相对路径。
 *
 * 它不解析视频、不抽骨架、不评分。暂存区无状态：过期靠文件 mtime 判定，不建表。
 */

const DEFAULT_MAX_BYTES = 512 * 1024 ** 2;
const DEFAULT_TTL_MINUTES = 120;
const HARD_MAX_BYTES = 1024 ** 3;
const MIN_MAX_BYTES = 1024 ** 2;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

export interface UploadsConfig {
  /** 覆盖 FITNESS_VIDEO_ROOT。装配方若给 HTTP 入口传了 videoRoot，必须传同一个值。 */
  readonly root?: string;
  readonly maxBytes?: number;
  readonly ttlMinutes?: number;
}

export class UploadsPlugin extends Service implements FitnessUploads {
  static provide = 'fitnessUploads';

  private readonly configuredRoot: string | undefined;
  private readonly maxBytes: number;
  private readonly ttlMs: number;

  constructor(ctx: Context, config: UploadsConfig = {}) {
    super(ctx, 'fitnessUploads');
    this.configuredRoot = config.root ?? process.env.FITNESS_VIDEO_ROOT ?? undefined;
    this.maxBytes = config.maxBytes
      ?? boundedInteger(process.env.FITNESS_UPLOAD_MAX_BYTES, DEFAULT_MAX_BYTES, MIN_MAX_BYTES, HARD_MAX_BYTES);
    this.ttlMs = (config.ttlMinutes
      ?? boundedInteger(process.env.FITNESS_UPLOAD_TTL_MINUTES, DEFAULT_TTL_MINUTES, 5, 1440)) * 60_000;
  }

  root(): string | undefined {
    const root = this.configuredRoot;
    return root && root.trim() ? resolve(root) : undefined;
  }

  async receive(request: UploadRequest): Promise<UploadReceipt> {
    const root = this.root();
    if (!root) throw new FitnessError('UPLOAD_UNAVAILABLE', '未配置视频根目录 FITNESS_VIDEO_ROOT');
    if (request.declaredBytes > this.maxBytes) {
      throw new FitnessError('UPLOAD_TOO_LARGE', `上传体积超过 ${this.maxBytes} 字节上限`);
    }

    await this.sweep();

    const id = randomUUID();
    const name = `${id}${request.extension}`;
    const directory = join(root, UPLOAD_DIRECTORY, ...this.ownerSegments(request.owner));
    const absolute = join(directory, name);
    // 归属分两层：租户目录 + 用户目录。未认证上传落到 _anonymous，仅供演示。
    try {
      await mkdir(directory, { recursive: true });
    } catch (cause) {
      throw new FitnessError('UPLOAD_UNAVAILABLE', '上传暂存区不可写', { cause });
    }

    const hash = createHash('sha256');
    let bytes = 0;
    let handle;
    try {
      handle = await open(absolute, 'wx');
    } catch (cause) {
      throw new FitnessError('UPLOAD_UNAVAILABLE', '无法创建暂存文件', { cause });
    }

    try {
      for await (const chunk of request.chunks) {
        bytes += chunk.byteLength;
        // 声明值只是预检；真正说了算的是实写字节。
        if (bytes > this.maxBytes) throw new FitnessError('UPLOAD_TOO_LARGE', `上传体积超过 ${this.maxBytes} 字节上限`);
        hash.update(chunk);
        await handle.write(chunk);
      }
      if (!bytes) throw new FitnessError('UPLOAD_INVALID', '上传内容为空');
      await handle.sync();
    } catch (cause) {
      await handle.close().catch(() => undefined);
      await rm(absolute, { force: true }).catch(() => undefined);
      if (cause instanceof FitnessError) throw cause;
      throw new FitnessError('UPLOAD_UNAVAILABLE', '写入暂存文件失败', { cause });
    }
    await handle.close();

    const info = await stat(absolute).catch(() => undefined);
    if (!info || info.size !== bytes) {
      await rm(absolute, { force: true }).catch(() => undefined);
      throw new FitnessError('UPLOAD_INVALID', '落盘字节数与预期不一致');
    }

    const receipt: UploadReceipt = Object.freeze({
      schemaVersion: '1.0' as const,
      id,
      path: relative(root, absolute).split(sep).join('/'),
      name,
      extension: request.extension,
      bytes,
      sha256: hash.digest('hex'),
      anonymous: request.owner === null,
      contentType: request.contentType,
      expiresAt: new Date(info.mtimeMs + this.ttlMs).toISOString(),
    });
    return receipt;
  }

  async remove(request: UploadRemoveRequest): Promise<void> {
    const root = this.root();
    if (!root) throw new FitnessError('UPLOAD_UNAVAILABLE', '未配置视频根目录 FITNESS_VIDEO_ROOT');
    if (!UUID_PATTERN.test(request.id)) throw new FitnessError('UPLOAD_NOT_FOUND', '上传不存在');
    const directory = join(root, UPLOAD_DIRECTORY, ...this.ownerSegments(request.owner));
    const entries = await readdir(directory).catch(() => undefined as string[] | undefined);
    // 只看自己的目录：别的租户/用户的上传在这里根本看不到，一律「不存在」。
    const name = entries?.find(entry => entry.startsWith(`${request.id}.`));
    if (!name) throw new FitnessError('UPLOAD_NOT_FOUND', '上传不存在');
    await rm(join(directory, name), { force: true }).catch(() => {
      throw new FitnessError('UPLOAD_NOT_FOUND', '上传不存在');
    });
  }

  async sweep(): Promise<number> {
    const root = this.root();
    if (!root) return 0;
    const base = join(root, UPLOAD_DIRECTORY);
    const deadline = Date.now() - this.ttlMs;
    let removed = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 3) return;
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => undefined);
      if (!entries) return;
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { await visit(path, depth + 1); continue; }
        if (!entry.isFile()) continue;
        const info = await stat(path).catch(() => undefined);
        if (!info || info.mtimeMs > deadline) continue;
        // 清理失败不阻断上传：临时文件留着比让用户传不上去强。
        await rm(path, { force: true }).then(() => { removed++; }).catch(() => undefined);
      }
    };
    await visit(base, 0);
    return removed;
  }

  private ownerSegments(owner: UploadRequest['owner']): string[] {
    if (!owner) return [UPLOAD_ANONYMOUS_DIRECTORY];
    // 会话行里的租户与用户都是 UUID；非 UUID 说明上游给了脏数据，宁可拒绝。
    if (!UUID_PATTERN.test(owner.tenantId) || !UUID_PATTERN.test(owner.userId)) {
      throw new FitnessError('UPLOAD_INVALID', '会话主体标识无效');
    }
    return [owner.tenantId, owner.userId];
  }
}
