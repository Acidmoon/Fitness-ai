import type {} from 'cordis';
import { FitnessError, type PolicyReference } from './contracts.ts';
import type { AuthPrincipal } from './auth-contracts.ts';
import { KEYPOINT_NAMES, type MotionAnalysis, type PoseSequence } from './vision-contracts.ts';

/**
 * Compact skeleton track and on-demand animated GIF preview contract.
 *
 * Raw videos and rendered GIF files are never persisted. Only a compact,
 * quantized, downsampled {@link PoseTrack} (typically 15–35 KB) is stored
 * encrypted per workout record; GIFs are rendered on demand from the track.
 */

export const POSE_TRACK_SCHEMA_VERSION = '1.0' as const;
export const POSE_TRACK_MAX_FRAMES = 150;
export const POSE_TRACK_MAX_FPS = 10;
export const POSE_TRACK_COORD_SCALE = 1000 as const;
export const POSE_TRACK_CONF_SCALE = 100 as const;
export const POSE_TRACK_KEYPOINT_COUNT = KEYPOINT_NAMES.length;
export const POSE_TRACK_VALUES_PER_FRAME = POSE_TRACK_KEYPOINT_COUNT * 3;
export const POSE_TRACK_MAX_SEGMENTS = 200;
/** Leaves headroom below the 64 KiB UserDataProtection plaintext ceiling. */
export const POSE_TRACK_MAX_BYTES = 56 * 1024;

export interface PoseTrackSegment {
  readonly kind: 'rep' | 'hold';
  readonly startMs: number;
  readonly bottomMs?: number;
  readonly endMs: number;
}

export interface PoseTrackFrame {
  /** Frame timestamp in milliseconds (non-negative integer, strictly increasing). */
  readonly timestampMs: number;
  /**
   * 17 COCO keypoints in {@link KEYPOINT_NAMES} order, flattened as 51 integers:
   * `[x0, y0, c0, x1, y1, c1, ..., x16, y16, c16]`
   * where `x, y ∈ [0, coordScale]` (normalized 0..1 relative to rotated frame width/height)
   * and `c ∈ [0, confScale]` (per-point confidence 0..1).
   */
  readonly keypoints: readonly number[];
}

export interface PoseTrack {
  readonly schemaVersion: typeof POSE_TRACK_SCHEMA_VERSION;
  readonly coordinateSpace: 'normalized';
  readonly exercise: string;
  /** Rotated source video frame dimensions in pixels (used to preserve aspect ratio). */
  readonly width: number;
  readonly height: number;
  /** Effective downsampled playback rate in frames per second (0 < fps ≤ 10). */
  readonly fps: number;
  readonly coordScale: typeof POSE_TRACK_COORD_SCALE;
  readonly confScale: typeof POSE_TRACK_CONF_SCALE;
  readonly modelId: string;
  readonly modelSha256: string;
  readonly motionPolicy: PolicyReference;
  readonly segments: readonly PoseTrackSegment[];
  readonly frames: readonly PoseTrackFrame[];
}

export interface PoseTrackReceipt {
  readonly schemaVersion: '1.0';
  readonly workoutId: string;
  readonly frames: number;
  readonly fps: number;
  readonly bytes: number;
  readonly updatedAt: string;
}

export interface RenderedSkeletonGif {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly etag: string;
}

export interface FitnessSkeletonPreview {
  /** Downsample and quantize a pose sequence and motion analysis into a compact PoseTrack. */
  compact(poses: PoseSequence, motion: MotionAnalysis): PoseTrack;
  /** Validate and store an encrypted PoseTrack for an owned workout record (idempotent upsert). */
  save(principal: AuthPrincipal, workoutId: string, track: unknown): Promise<PoseTrackReceipt>;
  /** Load and decrypt the PoseTrack for an owned workout record. */
  get(principal: AuthPrincipal, workoutId: string): Promise<PoseTrack>;
  /** Render (or return cached) animated GIF89a for an owned workout record. */
  renderGif(principal: AuthPrincipal, workoutId: string): Promise<RenderedSkeletonGif>;
  /** Pure GIF89a encoding of a validated PoseTrack. */
  encodeGif(track: PoseTrack): RenderedSkeletonGif;
}

function invalid(message: string): never {
  throw new FitnessError('POSE_TRACK_INVALID', message);
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function object(value: unknown, label = 'poseTrack'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} 必须是对象`);
  return value as Record<string, unknown>;
}

function exact(data: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) invalid(`${label} 包含未声明字段：${key}`);
  }
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    invalid(`${label} 格式无效`);
  }
  return value.trim();
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${label} 必须是 ${min}–${max} 的整数`);
  }
  return value;
}

function parsePolicy(value: unknown): PolicyReference {
  const data = object(value, 'motionPolicy');
  exact(data, ['id', 'version', 'kind'], 'motionPolicy');
  if (data.kind !== 'heuristic') invalid('motionPolicy.kind 仅支持 heuristic');
  if (typeof data.id !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(data.id)) invalid('motionPolicy.id 格式无效');
  if (typeof data.version !== 'string' || !/^[A-Za-z0-9.+_-]{1,40}$/.test(data.version)) invalid('motionPolicy.version 格式无效');
  return Object.freeze({ id: data.id, version: data.version, kind: 'heuristic' as const });
}

/**
 * Strictly validates an untrusted PoseTrack payload and returns a deeply frozen canonical copy.
 * Rejects unknown fields, out-of-range coordinates/confidences, non-monotonic timestamps,
 * and payloads exceeding {@link POSE_TRACK_MAX_BYTES}.
 */
export function parsePoseTrack(value: unknown): PoseTrack {
  const data = object(value);
  exact(data, [
    'schemaVersion', 'coordinateSpace', 'exercise', 'width', 'height', 'fps',
    'coordScale', 'confScale', 'modelId', 'modelSha256', 'motionPolicy', 'segments', 'frames',
  ], 'poseTrack');
  if (data.schemaVersion !== POSE_TRACK_SCHEMA_VERSION) invalid('schemaVersion 仅支持 1.0');
  if (data.coordinateSpace !== 'normalized') invalid('coordinateSpace 仅支持 normalized');
  const exercise = text(data.exercise, 'exercise', 64);
  const width = integer(data.width, 'width', 1, 8192);
  const height = integer(data.height, 'height', 1, 8192);
  if (typeof data.fps !== 'number' || !Number.isFinite(data.fps) || data.fps <= 0 || data.fps > POSE_TRACK_MAX_FPS) {
    invalid(`fps 必须在 (0, ${POSE_TRACK_MAX_FPS}] 之间`);
  }
  const fps = Math.round(data.fps * 100) / 100;
  if (fps <= 0 || fps > POSE_TRACK_MAX_FPS) invalid(`fps 必须在 (0, ${POSE_TRACK_MAX_FPS}] 之间`);
  if (data.coordScale !== POSE_TRACK_COORD_SCALE) invalid(`coordScale 仅支持 ${POSE_TRACK_COORD_SCALE}`);
  if (data.confScale !== POSE_TRACK_CONF_SCALE) invalid(`confScale 仅支持 ${POSE_TRACK_CONF_SCALE}`);
  const modelId = text(data.modelId, 'modelId', 128);
  if (typeof data.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.modelSha256)) {
    invalid('modelSha256 必须是 64 位小写十六进制串');
  }
  const motionPolicy = parsePolicy(data.motionPolicy);

  if (!Array.isArray(data.segments) || data.segments.length > POSE_TRACK_MAX_SEGMENTS) {
    invalid(`segments 必须是最多 ${POSE_TRACK_MAX_SEGMENTS} 项的数组`);
  }
  const segments: PoseTrackSegment[] = data.segments.map((item, idx) => {
    const seg = object(item, `segments[${idx}]`);
    exact(seg, ['kind', 'startMs', 'bottomMs', 'endMs'], `segments[${idx}]`);
    if (seg.kind !== 'rep' && seg.kind !== 'hold') invalid(`segments[${idx}].kind 仅支持 rep 或 hold`);
    const startMs = integer(seg.startMs, `segments[${idx}].startMs`, 0, 600_000);
    const endMs = integer(seg.endMs, `segments[${idx}].endMs`, startMs, 600_000);
    if (seg.bottomMs !== undefined) {
      if (seg.kind !== 'rep') invalid(`segments[${idx}].bottomMs 仅允许在 rep 段出现`);
      const bottomMs = integer(seg.bottomMs, `segments[${idx}].bottomMs`, startMs, endMs);
      return Object.freeze({ kind: 'rep' as const, startMs, bottomMs, endMs });
    }
    return Object.freeze({ kind: seg.kind, startMs, endMs });
  });

  if (!Array.isArray(data.frames) || data.frames.length < 1 || data.frames.length > POSE_TRACK_MAX_FRAMES) {
    invalid(`frames 必须是 1–${POSE_TRACK_MAX_FRAMES} 帧的非空数组`);
  }
  let previousTimestamp = -1;
  const frames: PoseTrackFrame[] = data.frames.map((item, idx) => {
    const raw = object(item, `frames[${idx}]`);
    exact(raw, ['timestampMs', 'keypoints'], `frames[${idx}]`);
    const timestampMs = integer(raw.timestampMs, `frames[${idx}].timestampMs`, 0, 600_000);
    if (timestampMs <= previousTimestamp) invalid('frames[].timestampMs 必须严格递增');
    previousTimestamp = timestampMs;
    if (!Array.isArray(raw.keypoints) || raw.keypoints.length !== POSE_TRACK_VALUES_PER_FRAME) {
      invalid(`frames[${idx}].keypoints 必须包含 ${POSE_TRACK_VALUES_PER_FRAME} 个整数`);
    }
    const keypoints = raw.keypoints.map((entry, offset) => {
      const limit = offset % 3 === 2 ? POSE_TRACK_CONF_SCALE : POSE_TRACK_COORD_SCALE;
      return integer(entry, `frames[${idx}].keypoints[${offset}]`, 0, limit);
    });
    return Object.freeze({ timestampMs, keypoints: Object.freeze(keypoints) });
  });

  const track: PoseTrack = Object.freeze({
    schemaVersion: POSE_TRACK_SCHEMA_VERSION,
    coordinateSpace: 'normalized' as const,
    exercise,
    width,
    height,
    fps,
    coordScale: POSE_TRACK_COORD_SCALE,
    confScale: POSE_TRACK_CONF_SCALE,
    modelId,
    modelSha256: data.modelSha256,
    motionPolicy,
    segments: Object.freeze(segments),
    frames: Object.freeze(frames),
  });

  const byteLength = Buffer.byteLength(JSON.stringify(track), 'utf8');
  if (byteLength > POSE_TRACK_MAX_BYTES) {
    throw new FitnessError('POSE_TRACK_TOO_LARGE', `骨架轨迹超过 ${POSE_TRACK_MAX_BYTES} 字节上限`);
  }
  return track;
}

/**
 * Downsamples and quantizes a MoveNet {@link PoseSequence} + {@link MotionAnalysis}
 * into a compact {@link PoseTrack} (fps ≤ 10, ≤ 150 frames, normalized 0..1000 coords).
 */
export function compactPoseTrack(poses: PoseSequence, motion: MotionAnalysis): PoseTrack {
  const source = poses.frames;
  if (!source.length) invalid('骨架帧序列为空');
  const width = Math.max(1, Math.min(8192, Math.round(poses.video.width)));
  const height = Math.max(1, Math.min(8192, Math.round(poses.video.height)));

  const firstTs = source[0]!.timestampMs;
  const lastTs = source[source.length - 1]!.timestampMs;
  const spanMs = Math.max(0, lastTs - firstTs);
  const minStepMs = Math.max(1000 / POSE_TRACK_MAX_FPS, spanMs > 0 ? spanMs / (POSE_TRACK_MAX_FRAMES - 1) : 0);

  const selectedIndices: number[] = [0];
  let lastPickedTs = firstTs;
  for (let i = 1; i < source.length; i++) {
    const ts = source[i]!.timestampMs;
    if (ts - lastPickedTs >= minStepMs - 1e-6) {
      selectedIndices.push(i);
      lastPickedTs = ts;
    }
  }
  // Ensure the final frame is represented when the clip has multiple frames.
  if (source.length > 1 && selectedIndices[selectedIndices.length - 1] !== source.length - 1) {
    if (selectedIndices.length < POSE_TRACK_MAX_FRAMES) {
      selectedIndices.push(source.length - 1);
    } else {
      selectedIndices[selectedIndices.length - 1] = source.length - 1;
    }
  }
  // Hard cap to POSE_TRACK_MAX_FRAMES via uniform decimation if needed.
  let finalIndices = selectedIndices;
  if (selectedIndices.length > POSE_TRACK_MAX_FRAMES) {
    finalIndices = [];
    const stride = (selectedIndices.length - 1) / (POSE_TRACK_MAX_FRAMES - 1);
    for (let i = 0; i < POSE_TRACK_MAX_FRAMES; i++) {
      finalIndices.push(selectedIndices[Math.round(i * stride)]!);
    }
  }

  let previousTs = -1;
  const frames: PoseTrackFrame[] = finalIndices.map(index => {
    const frame = source[index]!;
    let timestampMs = Math.max(0, Math.min(600_000, Math.round(frame.timestampMs)));
    if (timestampMs <= previousTs) timestampMs = Math.min(600_000, previousTs + 1);
    previousTs = timestampMs;

    const keypoints: number[] = new Array(POSE_TRACK_VALUES_PER_FRAME);
    for (let k = 0; k < POSE_TRACK_KEYPOINT_COUNT; k++) {
      const point = frame.keypoints[k];
      if (!point) {
        keypoints[k * 3] = 0;
        keypoints[k * 3 + 1] = 0;
        keypoints[k * 3 + 2] = 0;
      } else {
        keypoints[k * 3] = clampInt((point.x / width) * POSE_TRACK_COORD_SCALE, 0, POSE_TRACK_COORD_SCALE);
        keypoints[k * 3 + 1] = clampInt((point.y / height) * POSE_TRACK_COORD_SCALE, 0, POSE_TRACK_COORD_SCALE);
        keypoints[k * 3 + 2] = clampInt(point.confidence * POSE_TRACK_CONF_SCALE, 0, POSE_TRACK_CONF_SCALE);
      }
    }
    return Object.freeze({ timestampMs, keypoints: Object.freeze(keypoints) });
  });

  let fps: number;
  if (frames.length <= 1) {
    fps = Math.min(POSE_TRACK_MAX_FPS, Math.max(1, Math.round(poses.sampling.requestedFps)));
  } else {
    const effectiveSpanSec = (frames[frames.length - 1]!.timestampMs - frames[0]!.timestampMs) / 1000;
    const rawFps = effectiveSpanSec > 0 ? (frames.length - 1) / effectiveSpanSec : POSE_TRACK_MAX_FPS;
    fps = Math.min(POSE_TRACK_MAX_FPS, Math.max(0.1, Math.round(rawFps * 100) / 100));
  }

  const segments: PoseTrackSegment[] = [];
  for (const rep of motion.repetitions) {
    if (segments.length >= POSE_TRACK_MAX_SEGMENTS) break;
    const startMs = clampInt(rep.startMs, 0, 600_000);
    const endMs = clampInt(Math.max(rep.endMs, startMs), startMs, 600_000);
    const bottomMs = clampInt(rep.bottomMs, startMs, endMs);
    segments.push(Object.freeze({ kind: 'rep' as const, startMs, bottomMs, endMs }));
  }
  for (const hold of motion.holds ?? []) {
    if (segments.length >= POSE_TRACK_MAX_SEGMENTS) break;
    const startMs = clampInt(hold.startMs, 0, 600_000);
    const endMs = clampInt(Math.max(hold.endMs, startMs), startMs, 600_000);
    segments.push(Object.freeze({ kind: 'hold' as const, startMs, endMs }));
  }

  return Object.freeze({
    schemaVersion: POSE_TRACK_SCHEMA_VERSION,
    coordinateSpace: 'normalized' as const,
    exercise: motion.exercise,
    width,
    height,
    fps,
    coordScale: POSE_TRACK_COORD_SCALE,
    confScale: POSE_TRACK_CONF_SCALE,
    modelId: poses.model.id,
    modelSha256: poses.model.sha256,
    motionPolicy: motion.policy,
    segments: Object.freeze(segments),
    frames: Object.freeze(frames),
  });
}

declare module 'cordis' {
  interface Context {
    fitnessSkeletonPreview: FitnessSkeletonPreview;
  }
}
