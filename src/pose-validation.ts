import { FitnessError } from './contracts.ts';
import { KEYPOINT_NAMES, type PoseSequence } from './vision-contracts.ts';

function invalid(): never { throw new FitnessError('POSE_INVALID', '识别插件返回的骨架数据不符合 1.0 契约'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function finite(value: unknown, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid();
  return value;
}
function integer(value: unknown, min = 0): number {
  const result = finite(value, min);
  if (!Number.isInteger(result)) invalid();
  return result;
}

/** Validate across the Python process boundary before publishing to other plugins. */
export function parsePoseSequence(value: unknown): PoseSequence {
  const data = object(value);
  if (data.schemaVersion !== '1.0' || data.coordinateSpace !== 'image-pixels') invalid();
  const model = object(data.model);
  if (typeof model.id !== 'string' || !model.id || typeof model.inputDtype !== 'string' || !model.inputDtype
    || typeof model.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(model.sha256)
    || typeof model.runtime !== 'string' || !model.runtime
    || (model.preprocessing !== undefined && (typeof model.preprocessing !== 'string' || !model.preprocessing))) invalid();
  integer(model.inputSize, 1);
  const video = object(data.video);
  if (typeof video.name !== 'string' || video.timestampSource !== 'decoder-pts') invalid();
  integer(video.width, 1); integer(video.height, 1);
  finite(video.sourceFps, Number.MIN_VALUE, 1000); finite(video.durationMs, Number.MIN_VALUE, 181_000);
  integer(video.totalFrames, 1); integer(video.decodedFrames, 1); finite(video.rotationDegrees);
  if (video.totalFrames !== video.decodedFrames) invalid();
  const sampling = object(data.sampling);
  finite(sampling.requestedFps, 1, 30);
  const performance = object(data.performance);
  finite(performance.elapsedMs, 0); finite(performance.inferenceMs, 0);
  if (!Array.isArray(data.frames) || !data.frames.length || data.frames.length > 5400
    || sampling.sampledFrames !== data.frames.length) invalid();
  let previousTime = -1;
  let previousIndex = -1;
  for (const raw of data.frames) {
    const frame = object(raw);
    const index = integer(frame.frameIndex);
    const timestamp = finite(frame.timestampMs, 0, video.durationMs as number);
    if (index <= previousIndex || index >= (video.decodedFrames as number) || timestamp <= previousTime) invalid();
    previousIndex = index; previousTime = timestamp;
    if (!Array.isArray(frame.keypoints) || frame.keypoints.length !== 17) invalid();
    frame.keypoints.forEach((rawPoint: unknown, id: number) => {
      const point = object(rawPoint);
      if (point.name !== KEYPOINT_NAMES[id]) invalid();
      finite(point.x); finite(point.y); finite(point.confidence, 0, 1);
      Object.freeze(point);
    });
    if (frame.region !== undefined) {
      const region = object(frame.region);
      finite(region.x); finite(region.y); integer(region.width, 1); integer(region.height, 1);
      Object.freeze(region);
    }
    Object.freeze(frame.keypoints); Object.freeze(frame);
  }
  Object.freeze(model); Object.freeze(video); Object.freeze(sampling); Object.freeze(performance);
  Object.freeze(data.frames); Object.freeze(data);
  return data as unknown as PoseSequence;
}
