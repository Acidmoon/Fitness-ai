import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type {
  FitnessMotion, Keypoint, KeypointName, MotionAnalysis, MotionFrame, MotionRepetition,
  MotionRequest, PoseFrame, PoseSequence,
} from '../vision-contracts.ts';

interface Feature extends MotionFrame {
  readonly torsoInclination: number | null;
  readonly bodyAlignment: number | null;
}
const MIN_POINT_CONFIDENCE = 0.3;
const MAX_GAP_MS = 350;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number | null {
  const ax = a.x - b.x; const ay = a.y - b.y;
  const cx = c.x - b.x; const cy = c.y - b.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  if (denominator < 1e-6) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / denominator))) * 180 / Math.PI;
}

function requiredNames(side: 'left' | 'right', exercise: MotionRequest['exercise']): KeypointName[] {
  return exercise === 'squat'
    ? [`${side}_shoulder`, `${side}_hip`, `${side}_knee`, `${side}_ankle`]
    : [`${side}_shoulder`, `${side}_elbow`, `${side}_wrist`, `${side}_hip`, `${side}_ankle`];
}

function points(frame: PoseFrame, names: readonly KeypointName[]): Keypoint[] {
  return names.map(name => frame.keypoints.find(point => point.name === name)!);
}

function extract(poses: PoseSequence, request: MotionRequest): { side: 'left' | 'right'; features: Feature[] } {
  const reliability = (side: 'left' | 'right') => mean(poses.frames.map(frame =>
    Math.min(...points(frame, requiredNames(side, request.exercise)).map(point => point.confidence))));
  // Fix the side for the whole session so left/right switching cannot manufacture a cycle.
  const side = reliability('left') >= reliability('right') ? 'left' : 'right';
  const names = requiredNames(side, request.exercise);
  const history: number[] = [];
  let lastValid = -Infinity;
  const features = poses.frames.map((frame): Feature => {
    const selected = points(frame, names);
    const confidence = mean(selected.map(point => point.confidence));
    const valid = selected.every(point => point.confidence >= MIN_POINT_CONFIDENCE
      && point.x >= 0 && point.x < poses.video.width && point.y >= 0 && point.y < poses.video.height);
    const base = { frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, confidence };
    if (!valid) return Object.freeze({ ...base, angle: null, torsoInclination: null, bodyAlignment: null });
    const point = (name: string) => frame.keypoints.find(item => item.name === `${side}_${name}`)!;
    const shoulder = point('shoulder'); const hip = point('hip'); const ankle = point('ankle');
    const angle = request.exercise === 'squat'
      ? jointAngle(hip, point('knee'), ankle)
      : jointAngle(shoulder, point('elbow'), point('wrist'));
    const bodyAlignment = jointAngle(shoulder, hip, ankle);
    if (angle === null || bodyAlignment === null) {
      return Object.freeze({ ...base, angle: null, torsoInclination: null, bodyAlignment: null });
    }
    if (frame.timestampMs - lastValid > MAX_GAP_MS) history.length = 0;
    lastValid = frame.timestampMs;
    history.push(angle);
    if (history.length > 3) history.shift();
    const sorted = [...history].sort((a, b) => a - b);
    const smoothed = sorted[Math.floor(sorted.length / 2)]!;
    return Object.freeze({
      ...base, angle: smoothed, bodyAlignment,
      torsoInclination: Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(shoulder.y - hip.y)) * 180 / Math.PI,
    });
  });
  return { side, features };
}

export class JointMotionPlugin extends Service implements FitnessMotion {
  static provide = 'fitnessMotion';
  constructor(ctx: Context) { super(ctx, 'fitnessMotion'); }

  analyze(poses: PoseSequence, request: MotionRequest): MotionAnalysis {
    if (!['squat', 'push-up'].includes(request.exercise)) {
      throw new FitnessError('UNSUPPORTED_EXERCISE', '动作分析目前支持 squat 和 push-up');
    }
    if (!Number.isInteger(request.targetRepetitions) || request.targetRepetitions < 1 || request.targetRepetitions > 10_000
      || !request.sessionId.trim() || request.sessionId.length > 128 || !poses.frames.length) {
      throw new FitnessError('INVALID_WORKOUT', '动作分析请求缺少有效目标次数、会话标识或骨架帧');
    }
    const { side, features } = extract(poses, request);
    const top = request.exercise === 'squat' ? 160 : 155;
    const epsilon = 1e-6;
    let ready: Feature | undefined;
    let active: Feature[] | undefined;
    let lastValid = -Infinity;
    let discarded = 0;
    let interruptions = 0;
    const repetitions: MotionRepetition[] = [];
    for (const frame of features) {
      if (frame.angle === null) continue;
      if (frame.timestampMs - lastValid > MAX_GAP_MS) {
        if (active) interruptions++;
        ready = undefined; active = undefined;
      }
      lastValid = frame.timestampMs;
      if (!active) {
        if (frame.angle >= top - epsilon) ready = frame;
        else if (ready && frame.angle <= top - 10 + epsilon) { active = [ready, frame]; ready = undefined; }
        continue;
      }
      active.push(frame);
      const start = active[0]!;
      if (frame.timestampMs - start.timestampMs > 15_000) {
        discarded++; active = undefined; ready = undefined;
        continue;
      }
      if (frame.angle < top - epsilon) continue;
      const lowest = active.reduce((best, item) => item.angle! < best.angle! ? item : best);
      const maxAngle = Math.max(...active.map(item => item.angle!));
      const minAngle = lowest.angle!;
      const durationMs = frame.timestampMs - start.timestampMs;
      // Temporal completeness establishes a cycle; depth remains an explainable quality metric.
      if (maxAngle - minAngle >= 30 - epsilon && durationMs >= 500 && active.length >= 4
        && lowest.timestampMs > start.timestampMs && lowest.timestampMs < frame.timestampMs) {
        const inclinations = active.map(item => item.torsoInclination!);
        const inclinationMean = mean(inclinations);
        const deviation = Math.sqrt(mean(inclinations.map(value => (value - inclinationMean) ** 2)));
        const stability = request.exercise === 'squat'
          ? clamp(1 - deviation / 45)
          : mean(active.map(item => clamp(1 - Math.abs(180 - item.bodyAlignment!) / 90)));
        repetitions.push(Object.freeze({
          startMs: start.timestampMs, bottomMs: lowest.timestampMs, endMs: frame.timestampMs,
          minAngle, maxAngle, durationMs, rangeOfMotion: clamp((maxAngle - minAngle) / 80),
          stability, confidence: mean(active.map(item => item.confidence)),
        }));
      } else { discarded++; }
      active = undefined; ready = frame;
    }
    if (active) discarded++;
    const validFrames = features.filter(frame => frame.angle !== null).length;
    const warnings: string[] = [];
    if (features.length - validFrames > 0) warnings.push(`${features.length - validFrames} 帧因关键点置信度不足、越界或退化几何被排除`);
    if (interruptions) warnings.push(`${interruptions} 个动作片段因超过 350ms 的有效帧间隔被中断`);
    if (discarded) warnings.push(`${discarded} 个片段未满足完整往返、幅度或时长要求，未计次`);
    if (!repetitions.length) warnings.push('没有检测到可信的完整动作周期；不能据此产生运动评分');
    const workout = Object.freeze({
      schemaVersion: '1.0' as const, sessionId: request.sessionId, exercise: request.exercise,
      targetRepetitions: request.targetRepetitions, repetitions: Object.freeze(repetitions),
    });
    const result: MotionAnalysis = Object.freeze({
      schemaVersion: '1.0', policy: Object.freeze({ id: `joint-cycle-${request.exercise}`, version: '0.2.0', kind: 'heuristic' }),
      exercise: request.exercise, side, validFrames, rejectedFrames: features.length - validFrames,
      repetitions: Object.freeze(repetitions), features: Object.freeze(features), warnings: Object.freeze(warnings), workout,
    });
    this.ctx.emit('fitness/motion-produced', result);
    return result;
  }
}
