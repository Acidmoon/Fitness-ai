import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import {
  isSupportedExercise, type FitnessMotion, type Keypoint, type KeypointName, type MotionAnalysis,
  type MotionHold, type MotionRepetition, type MotionRequest, type PoseFrame,
  type PoseSequence, type SupportedExercise,
} from '../vision-contracts.ts';

const MIN_POINT_CONFIDENCE = 0.3;
const MAX_GAP_MS = 350;
const EPSILON = 1e-6;
const MAX_CYCLE_MS = 15_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const deviation = (values: readonly number[]) => {
  const center = mean(values);
  return Math.sqrt(mean(values.map(value => (value - center) ** 2)));
};

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index]!;
}

function medianPush(history: number[], value: number): number {
  history.push(value);
  if (history.length > 3) history.shift();
  const sorted = [...history].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

type Side = 'left' | 'right';

export function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number | null {
  const ax = a.x - b.x; const ay = a.y - b.y;
  const cx = c.x - b.x; const cy = c.y - b.y;
  const denominator = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  if (denominator < EPSILON) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / denominator))) * 180 / Math.PI;
}

/** Degrees between the hip→shoulder vector and the horizontal axis (0 = lying flat). */
function torsoLift(shoulder: Keypoint, hip: Keypoint): number | null {
  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(shoulder.y - hip.y);
  if (Math.hypot(dx, dy) < EPSILON) return null;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

type Measure = 'knee' | 'elbow' | 'hip' | 'torsoLift';

interface CycleProfile {
  readonly mode: 'cycle';
  readonly policyVersion: string;
  readonly parts: readonly string[];
  readonly measure: Measure;
  readonly extendedAt: 'high' | 'low';
  readonly threshold: number;
  readonly enterDelta: number;
  readonly minRange: number;
  readonly stability: 'torso' | 'alignment' | 'lift';
}

interface PlankHoldProfile {
  readonly mode: 'hold';
  readonly variant: 'plank';
  readonly policyVersion: string;
  readonly parts: readonly string[];
  /** Max degrees away from a straight shoulder–hip–ankle line. */
  readonly toleranceDeg: number;
  /** Max |shoulder.y − ankle.y| / body length for a horizontal plank. */
  readonly maxSlope: number;
  readonly minHoldMs: number;
}

interface BalanceHoldProfile {
  readonly mode: 'hold';
  readonly variant: 'balance';
  readonly policyVersion: string;
  readonly bilateralParts: readonly KeypointName[];
  /** Max degrees torso may tilt away from vertical. */
  readonly maxTorsoTiltDeg: number;
  /** Min vertical ankle separation divided by shoulder-to-standing-ankle span. */
  readonly minAnkleElevation: number;
  readonly minHoldMs: number;
}

interface OscillationProfile {
  readonly mode: 'oscillation';
  readonly policyVersion: string;
  readonly parts: readonly string[];
  /** Min vertical travel in body lengths for one jump. */
  readonly minAmplitude: number;
  readonly minIntervalMs: number;
}

interface ReachProfile {
  readonly mode: 'reach';
  readonly policyVersion: string;
  readonly parts: readonly string[];
  /** Max hip–trunk flexion angle (degrees) that counts as leaning forward. */
  readonly maxHipAngleDeg: number;
  /** Min knee extension angle (degrees) so bent knees do not qualify as sit-and-reach. */
  readonly minKneeAngleDeg: number;
  /** Min wrist projection along the hip→ankle leg axis (0 = hip, 1 = ankle). */
  readonly minReachRatio: number;
  /** Max |ankle.y − hip.y| / legLength confirming seated horizontal legs. */
  readonly maxLegSlope: number;
  readonly minHoldMs: number;
}

type Profile = CycleProfile | PlankHoldProfile | BalanceHoldProfile | OscillationProfile | ReachProfile;

/**
 * Each profile is an explicit, uncalibrated 2D heuristic. Thresholds follow the
 * 2D-rule family used for squat/push-up; they must not be read as clinical or
 * official campus fitness-test standards.
 */
const PROFILES: Readonly<Record<SupportedExercise, Profile>> = Object.freeze({
  squat: {
    mode: 'cycle', policyVersion: '0.2.0', parts: ['shoulder', 'hip', 'knee', 'ankle'], measure: 'knee',
    extendedAt: 'high', threshold: 160, enterDelta: 10, minRange: 30, stability: 'torso',
  },
  'push-up': {
    mode: 'cycle', policyVersion: '0.2.0', parts: ['shoulder', 'elbow', 'wrist', 'hip', 'ankle'], measure: 'elbow',
    extendedAt: 'high', threshold: 155, enterDelta: 10, minRange: 30, stability: 'alignment',
  },
  crunch: {
    mode: 'cycle', policyVersion: '0.1.0', parts: ['shoulder', 'hip', 'knee', 'ankle'], measure: 'torsoLift',
    extendedAt: 'low', threshold: 15, enterDelta: 6, minRange: 20, stability: 'lift',
  },
  'sit-up': {
    mode: 'cycle', policyVersion: '0.1.0', parts: ['shoulder', 'hip', 'knee', 'ankle'], measure: 'torsoLift',
    extendedAt: 'low', threshold: 15, enterDelta: 6, minRange: 45, stability: 'lift',
  },
  plank: {
    mode: 'hold', variant: 'plank', policyVersion: '0.1.0', parts: ['shoulder', 'hip', 'knee', 'ankle'],
    toleranceDeg: 25, maxSlope: 0.5, minHoldMs: 3_000,
  },
  'jump-rope': {
    mode: 'oscillation', policyVersion: '0.1.0', parts: ['shoulder', 'hip', 'ankle'],
    minAmplitude: 0.03, minIntervalMs: 350,
  },
  'sit-and-reach': {
    mode: 'reach', policyVersion: '0.1.0', parts: ['shoulder', 'wrist', 'hip', 'knee', 'ankle'],
    maxHipAngleDeg: 85, minKneeAngleDeg: 145, minReachRatio: 0.55, maxLegSlope: 0.55, minHoldMs: 1_500,
  },
  balance: {
    mode: 'hold', variant: 'balance', policyVersion: '0.1.0',
    bilateralParts: ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle'],
    maxTorsoTiltDeg: 25, minAnkleElevation: 0.06, minHoldMs: 3_000,
  },
});

/** Mutable during extraction (signal normalization); frozen before it leaves `analyze`. */
interface Feature {
  frameIndex: number;
  timestampMs: number;
  angle: number | null;
  confidence: number;
  torsoInclination: number | null;
  bodyAlignment: number | null;
  signal: number | null;
  slope: number | null;
  bodyLength: number | null;
  kneeAngle: number | null;
  upright: boolean;
}

function namesFor(side: Side, parts: readonly string[]): KeypointName[] {
  return parts.map(part => `${side}_${part}` as KeypointName);
}

function points(frame: PoseFrame, names: readonly KeypointName[]): Keypoint[] {
  return names.map(name => frame.keypoints.find(point => point.name === name)!);
}

function inBounds(point: Keypoint, poses: PoseSequence): boolean {
  return point.confidence >= MIN_POINT_CONFIDENCE
    && point.x >= 0 && point.x < poses.video.width
    && point.y >= 0 && point.y < poses.video.height;
}

function measureAngle(measure: Measure, point: (name: string) => Keypoint): number | null {
  switch (measure) {
    case 'knee': return jointAngle(point('hip'), point('knee'), point('ankle'));
    case 'elbow': return jointAngle(point('shoulder'), point('elbow'), point('wrist'));
    case 'hip': return jointAngle(point('shoulder'), point('hip'), point('knee'));
    case 'torsoLift': return torsoLift(point('shoulder'), point('hip'));
  }
}

function midpoint(a: Keypoint, b: Keypoint, name: KeypointName): Keypoint {
  return { name, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, confidence: (a.confidence + b.confidence) / 2 };
}

function extractBalance(poses: PoseSequence, profile: BalanceHoldProfile): { side: Side; features: Feature[] } {
  const angleHistory: number[] = [];
  const elevationHistory: number[] = [];
  let lastValid = -Infinity;
  let leftStanceCount = 0;
  let rightStanceCount = 0;

  const frames = poses.frames.map((frame): Feature => {
    const selected = points(frame, profile.bilateralParts);
    const confidence = mean(selected.map(point => point.confidence));
    const base = { frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, confidence };
    if (!selected.every(point => inBounds(point, poses))) {
      return {
        ...base, angle: null, torsoInclination: null, bodyAlignment: null,
        signal: null, slope: null, bodyLength: null, kneeAngle: null, upright: false,
      };
    }
    const byName = (name: KeypointName) => frame.keypoints.find(item => item.name === name)!;
    const leftShoulder = byName('left_shoulder');
    const rightShoulder = byName('right_shoulder');
    const leftHip = byName('left_hip');
    const rightHip = byName('right_hip');
    const leftAnkle = byName('left_ankle');
    const rightAnkle = byName('right_ankle');

    const midShoulder = midpoint(leftShoulder, rightShoulder, 'left_shoulder');
    const midHip = midpoint(leftHip, rightHip, 'left_hip');
    const leftStanding = leftAnkle.y >= rightAnkle.y;
    const standingAnkle = leftStanding ? leftAnkle : rightAnkle;
    const raisedAnkle = leftStanding ? rightAnkle : leftAnkle;

    const span = Math.hypot(standingAnkle.x - midShoulder.x, standingAnkle.y - midShoulder.y);
    const bodyAlignment = jointAngle(midShoulder, midHip, standingAnkle);
    if (bodyAlignment === null || span < EPSILON) {
      return {
        ...base, angle: null, torsoInclination: null, bodyAlignment: null,
        signal: null, slope: null, bodyLength: null, kneeAngle: null, upright: false,
      };
    }
    const torsoInclination = Math.atan2(Math.abs(midShoulder.x - midHip.x), Math.abs(midShoulder.y - midHip.y)) * 180 / Math.PI;
    const upright = midShoulder.y < midHip.y && midHip.y < standingAnkle.y;
    const rawElevation = (standingAnkle.y - raisedAnkle.y) / span;

    if (frame.timestampMs - lastValid > MAX_GAP_MS) {
      angleHistory.length = 0;
      elevationHistory.length = 0;
    }
    lastValid = frame.timestampMs;
    const smoothedAngle = medianPush(angleHistory, bodyAlignment);
    const smoothedElevation = medianPush(elevationHistory, rawElevation);
    if (leftStanding) leftStanceCount++;
    else rightStanceCount++;

    return {
      ...base,
      angle: smoothedAngle,
      torsoInclination,
      bodyAlignment,
      signal: smoothedElevation,
      slope: Math.abs(standingAnkle.x - midShoulder.x) / span,
      bodyLength: span,
      kneeAngle: null,
      upright,
    };
  });

  const side: Side = leftStanceCount >= rightStanceCount ? 'left' : 'right';
  return { side, features: frames };
}

function extract(poses: PoseSequence, profile: Profile, exercise: SupportedExercise): { side: Side; features: Feature[] } {
  if (profile.mode === 'hold' && profile.variant === 'balance') {
    return extractBalance(poses, profile);
  }
  const reliability = (side: Side) => mean(poses.frames.map(frame =>
    Math.min(...points(frame, namesFor(side, profile.parts)).map(point => point.confidence))));
  // Fix the side for the whole session so left/right switching cannot manufacture a cycle.
  const side = reliability('left') >= reliability('right') ? 'left' : 'right';
  const names = namesFor(side, profile.parts);
  const angleHistory: number[] = [];
  const signalHistory: number[] = [];
  let lastValid = -Infinity;

  const frames = poses.frames.map((frame): Feature => {
    const selected = points(frame, names);
    const confidence = mean(selected.map(point => point.confidence));
    const base = { frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, confidence };
    if (!selected.every(point => inBounds(point, poses))) {
      return {
        ...base, angle: null, torsoInclination: null, bodyAlignment: null,
        signal: null, slope: null, bodyLength: null, kneeAngle: null, upright: false,
      };
    }
    const point = (name: string) => frame.keypoints.find(item => item.name === `${side}_${name}`)!;
    const shoulder = point('shoulder'); const hip = point('hip'); const ankle = point('ankle');
    const bodyAlignment = jointAngle(shoulder, hip, ankle);
    const torsoInclination = Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(shoulder.y - hip.y)) * 180 / Math.PI;
    const span = Math.hypot(ankle.x - shoulder.x, ankle.y - shoulder.y);

    if (profile.mode === 'reach') {
      const knee = point('knee');
      const wrist = point('wrist');
      const hipAngle = jointAngle(shoulder, hip, knee);
      const kneeAngle = jointAngle(hip, knee, ankle);
      const legDx = ankle.x - hip.x;
      const legDy = ankle.y - hip.y;
      const legLength = Math.hypot(legDx, legDy);
      if (hipAngle === null || kneeAngle === null || bodyAlignment === null || legLength < EPSILON) {
        return {
          ...base, angle: null, torsoInclination: null, bodyAlignment: null,
          signal: null, slope: null, bodyLength: null, kneeAngle: null, upright: false,
        };
      }
      if (frame.timestampMs - lastValid > MAX_GAP_MS) {
        angleHistory.length = 0;
        signalHistory.length = 0;
      }
      lastValid = frame.timestampMs;
      const smoothedAngle = medianPush(angleHistory, hipAngle);
      const rawReachRatio = ((wrist.x - hip.x) * legDx + (wrist.y - hip.y) * legDy) / (legLength * legLength);
      const smoothedReach = medianPush(signalHistory, rawReachRatio);
      return {
        ...base,
        angle: smoothedAngle,
        torsoInclination,
        bodyAlignment,
        signal: smoothedReach,
        slope: Math.abs(legDy) / legLength,
        bodyLength: legLength,
        kneeAngle,
        upright: false,
      };
    }

    const raw = profile.mode === 'cycle' ? measureAngle(profile.measure, point) : bodyAlignment;
    if (raw === null || bodyAlignment === null || span < EPSILON) {
      return {
        ...base, angle: null, torsoInclination: null, bodyAlignment: null,
        signal: null, slope: null, bodyLength: null, kneeAngle: null, upright: false,
      };
    }
    if (frame.timestampMs - lastValid > MAX_GAP_MS) angleHistory.length = 0;
    lastValid = frame.timestampMs;
    const smoothed = medianPush(angleHistory, raw);
    return {
      ...base,
      angle: smoothed,
      torsoInclination,
      bodyAlignment,
      bodyLength: span,
      slope: Math.abs(ankle.y - shoulder.y) / span,
      signal: exercise === 'jump-rope' ? hip.y : null,
      kneeAngle: null,
      upright: false,
    };
  });
  if (exercise === 'jump-rope') normalizeSignal(frames);
  return { side, features: frames };
}

/** Convert hip pixel height into body lengths, so a jump amplitude is scale-invariant. */
function normalizeSignal(frames: Feature[]): void {
  const usable = frames.filter(frame => frame.signal !== null && frame.bodyLength !== null);
  if (!usable.length) return;
  const heights = usable.map(frame => frame.signal!).sort((a, b) => a - b);
  const center = heights[Math.floor(heights.length / 2)]!;
  const lengths = usable.map(frame => frame.bodyLength!).sort((a, b) => a - b);
  const scale = lengths[Math.floor(lengths.length / 2)]!;
  if (scale < EPSILON) return;
  for (const frame of frames) {
    if (frame.signal !== null) frame.signal = (frame.signal - center) / scale;
  }
}

function detectCycle(features: readonly Feature[], profile: CycleProfile): { repetitions: MotionRepetition[]; discarded: number; interruptions: number } {
  const isExtended = (value: number) => profile.extendedAt === 'high'
    ? value >= profile.threshold - EPSILON
    : value <= profile.threshold + EPSILON;
  const hasEntered = (value: number) => profile.extendedAt === 'high'
    ? value <= profile.threshold - profile.enterDelta + EPSILON
    : value >= profile.threshold + profile.enterDelta - EPSILON;

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
      if (isExtended(frame.angle)) ready = frame;
      else if (ready && hasEntered(frame.angle)) { active = [ready, frame]; ready = undefined; }
      continue;
    }
    active.push(frame);
    const start = active[0]!;
    if (frame.timestampMs - start.timestampMs > MAX_CYCLE_MS) {
      discarded++; active = undefined; ready = undefined;
      continue;
    }
    if (!isExtended(frame.angle)) continue;
    // Deepest point of the flexion: lowest joint angle when extended at high, highest lift when extended low.
    const extreme = active.reduce((best, item) => profile.extendedAt === 'high'
      ? (item.angle! < best.angle! ? item : best)
      : (item.angle! > best.angle! ? item : best));
    const angles = active.map(item => item.angle!);
    const maxAngle = Math.max(...angles);
    const minAngle = Math.min(...angles);
    const durationMs = frame.timestampMs - start.timestampMs;
    // Temporal completeness establishes a cycle; depth remains an explainable quality metric.
    if (maxAngle - minAngle >= profile.minRange - EPSILON && durationMs >= 500 && active.length >= 4
      && extreme.timestampMs > start.timestampMs && extreme.timestampMs < frame.timestampMs) {
      const stability = profile.stability === 'torso'
        ? clamp(1 - deviation(active.map(item => item.torsoInclination ?? 0)) / 45)
        : profile.stability === 'alignment'
          ? mean(active.map(item => clamp(1 - Math.abs(180 - (item.bodyAlignment ?? 180)) / 90)))
          : clamp(1 - deviation(angles) / 25);
      repetitions.push(Object.freeze({
        startMs: start.timestampMs, bottomMs: extreme.timestampMs, endMs: frame.timestampMs,
        minAngle, maxAngle, durationMs, rangeOfMotion: clamp((maxAngle - minAngle) / 80),
        stability, confidence: mean(active.map(item => item.confidence)),
      }));
    } else { discarded++; }
    active = undefined; ready = frame;
  }
  if (active) discarded++;
  return { repetitions, discarded, interruptions };
}

function detectPlankHolds(features: readonly Feature[], profile: PlankHoldProfile): { repetitions: MotionRepetition[]; holds: MotionHold[]; discarded: number; interruptions: number } {
  const acceptable = (frame: Feature) => frame.angle !== null
    && Math.abs(180 - frame.angle) <= profile.toleranceDeg
    && (frame.slope ?? 1) <= profile.maxSlope;
  const repetitions: MotionRepetition[] = [];
  const holds: MotionHold[] = [];
  let run: Feature[] = [];
  let discarded = 0;
  let interruptions = 0;

  const flush = () => {
    if (!run.length) return;
    const start = run[0]!; const end = run[run.length - 1]!;
    const durationMs = end.timestampMs - start.timestampMs;
    if (durationMs < profile.minHoldMs || run.length < 4) { discarded++; run = []; return; }
    const alignment = mean(run.map(frame => clamp(1 - Math.abs(180 - frame.angle!) / profile.toleranceDeg)));
    const stability = clamp(1 - deviation(run.map(frame => frame.angle!)) / (profile.toleranceDeg * 2));
    const confidence = mean(run.map(frame => frame.confidence));
    holds.push(Object.freeze({
      startMs: start.timestampMs, endMs: end.timestampMs, durationMs,
      alignment, stability, confidence,
    }));
    repetitions.push(Object.freeze({
      startMs: start.timestampMs, bottomMs: end.timestampMs, endMs: end.timestampMs,
      durationMs, rangeOfMotion: alignment, stability, confidence, alignment,
    }));
    run = [];
  };

  for (const frame of features) {
    if (frame.angle === null) continue;
    if (run.length && frame.timestampMs - run[run.length - 1]!.timestampMs > MAX_GAP_MS) {
      interruptions++;
      flush();
    }
    if (acceptable(frame)) run.push(frame);
    else flush();
  }
  flush();
  return { repetitions, holds, discarded, interruptions };
}

function detectBalanceHolds(features: readonly Feature[], profile: BalanceHoldProfile): { repetitions: MotionRepetition[]; holds: MotionHold[]; discarded: number; interruptions: number } {
  const acceptable = (frame: Feature) => frame.angle !== null
    && frame.upright
    && frame.torsoInclination !== null
    && frame.torsoInclination <= profile.maxTorsoTiltDeg
    && frame.signal !== null
    && frame.signal >= profile.minAnkleElevation;
  const repetitions: MotionRepetition[] = [];
  const holds: MotionHold[] = [];
  let run: Feature[] = [];
  let discarded = 0;
  let interruptions = 0;

  const flush = () => {
    if (!run.length) return;
    const start = run[0]!; const end = run[run.length - 1]!;
    const durationMs = end.timestampMs - start.timestampMs;
    if (durationMs < profile.minHoldMs || run.length < 4) { discarded++; run = []; return; }
    const uprightScore = mean(run.map(frame => clamp(1 - (frame.torsoInclination ?? profile.maxTorsoTiltDeg) / profile.maxTorsoTiltDeg)));
    const elevationScore = mean(run.map(frame => clamp((frame.signal ?? 0) / 0.12)));
    const alignment = clamp(0.65 * uprightScore + 0.35 * elevationScore);
    const torsoSway = deviation(run.map(frame => frame.torsoInclination ?? 0));
    const alignmentSway = deviation(run.map(frame => frame.angle ?? 180));
    const stability = clamp(1 - (torsoSway / 15 + alignmentSway / 25) / 2);
    const confidence = mean(run.map(frame => frame.confidence));
    holds.push(Object.freeze({
      startMs: start.timestampMs, endMs: end.timestampMs, durationMs,
      alignment, stability, confidence,
    }));
    repetitions.push(Object.freeze({
      startMs: start.timestampMs, bottomMs: end.timestampMs, endMs: end.timestampMs,
      durationMs, rangeOfMotion: alignment, stability, confidence, alignment,
    }));
    run = [];
  };

  for (const frame of features) {
    if (frame.angle === null) continue;
    if (run.length && frame.timestampMs - run[run.length - 1]!.timestampMs > MAX_GAP_MS) {
      interruptions++;
      flush();
    }
    if (acceptable(frame)) run.push(frame);
    else flush();
  }
  flush();
  return { repetitions, holds, discarded, interruptions };
}

function detectReachHolds(features: readonly Feature[], profile: ReachProfile): { repetitions: MotionRepetition[]; holds: MotionHold[]; discarded: number; interruptions: number } {
  const acceptable = (frame: Feature) => frame.angle !== null
    && frame.kneeAngle !== null
    && frame.signal !== null
    && (frame.slope ?? 1) <= profile.maxLegSlope
    && frame.kneeAngle >= profile.minKneeAngleDeg - EPSILON
    && frame.angle <= profile.maxHipAngleDeg + EPSILON
    && frame.signal >= profile.minReachRatio - EPSILON;
  const repetitions: MotionRepetition[] = [];
  const holds: MotionHold[] = [];
  let run: Feature[] = [];
  let discarded = 0;
  let interruptions = 0;

  const flush = () => {
    if (!run.length) return;
    const start = run[0]!; const end = run[run.length - 1]!;
    const durationMs = end.timestampMs - start.timestampMs;
    if (durationMs < profile.minHoldMs || run.length < 4) { discarded++; run = []; return; }
    const deepest = run.reduce((best, item) => item.angle! < best.angle! ? item : best);
    const hipAngles = run.map(frame => frame.angle!);
    const minAngle = Math.min(...hipAngles);
    const maxAngle = Math.max(...hipAngles);
    const peakReach = Math.max(...run.map(frame => frame.signal!));
    const alignment = mean(run.map(frame => clamp((frame.kneeAngle! - profile.minKneeAngleDeg) / (180 - profile.minKneeAngleDeg))));
    const flexionScore = clamp((95 - minAngle) / 55);
    const reachScore = clamp((peakReach - 0.5) / 0.6);
    const rangeOfMotion = clamp(0.5 * flexionScore + 0.5 * reachScore);
    const stability = clamp(1 - deviation(hipAngles) / 15);
    const confidence = mean(run.map(frame => frame.confidence));
    holds.push(Object.freeze({
      startMs: start.timestampMs, endMs: end.timestampMs, durationMs,
      alignment, stability, confidence,
    }));
    repetitions.push(Object.freeze({
      startMs: start.timestampMs, bottomMs: deepest.timestampMs, endMs: end.timestampMs,
      minAngle, maxAngle, amplitude: peakReach, alignment,
      durationMs, rangeOfMotion, stability, confidence,
    }));
    run = [];
  };

  for (const frame of features) {
    if (frame.angle === null) continue;
    if (run.length && frame.timestampMs - run[run.length - 1]!.timestampMs > MAX_GAP_MS) {
      interruptions++;
      flush();
    }
    if (acceptable(frame)) run.push(frame);
    else flush();
  }
  flush();
  return { repetitions, holds, discarded, interruptions };
}

function detectOscillation(features: readonly Feature[], profile: OscillationProfile): { repetitions: MotionRepetition[]; discarded: number; interruptions: number } {
  const samples = features.filter(frame => frame.signal !== null && frame.signal !== undefined);
  if (samples.length < 8) return { repetitions: [], discarded: 0, interruptions: 0 };
  const values = samples.map(frame => frame.signal!);
  const smooth = values.map((_, index) => {
    const window = values.slice(Math.max(0, index - 2), Math.min(values.length, index + 3)).sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)]!;
  });

  // Feet contact the ground at local maxima of hip height; one jump sits between two contacts.
  const maxima: number[] = [];
  for (let index = 1; index < smooth.length - 1; index++) {
    if (smooth[index]! >= smooth[index - 1]! && smooth[index]! > smooth[index + 1]!) maxima.push(index);
  }
  const kept: number[] = [];
  for (const index of maxima) {
    const last = kept[kept.length - 1];
    if (last !== undefined && samples[index]!.timestampMs - samples[last]!.timestampMs < profile.minIntervalMs) {
      if (smooth[index]! > smooth[last]!) kept[kept.length - 1] = index;
    } else kept.push(index);
  }

  const collected: { repetition: MotionRepetition; durationMs: number }[] = [];
  let discarded = 0;
  for (let index = 0; index + 1 < kept.length; index++) {
    const a = kept[index]!; const b = kept[index + 1]!;
    let apex = a;
    for (let cursor = a; cursor <= b; cursor++) if (smooth[cursor]! < smooth[apex]!) apex = cursor;
    const amplitude = Math.min(smooth[a]! - smooth[apex]!, smooth[b]! - smooth[apex]!);
    if (amplitude < profile.minAmplitude) { discarded++; continue; }
    const active = samples.slice(a, b + 1);
    collected.push({
      durationMs: samples[b]!.timestampMs - samples[a]!.timestampMs,
      repetition: {
        startMs: samples[a]!.timestampMs, bottomMs: samples[apex]!.timestampMs,
        endMs: samples[b]!.timestampMs, durationMs: samples[b]!.timestampMs - samples[a]!.timestampMs,
        amplitude, rangeOfMotion: clamp(amplitude / 0.15), stability: 1,
        confidence: mean(active.map(frame => frame.confidence)),
      },
    });
  }
  // Jump-rope stability is rhythm regularity, not joint steadiness.
  const durations = collected.map(item => item.durationMs);
  const rhythm = durations.length > 1
    ? clamp(1 - deviation(durations) / Math.max(mean(durations), EPSILON) / 0.35)
    : 1;
  const repetitions = collected.map(item => Object.freeze({ ...item.repetition, stability: rhythm }));
  return { repetitions, discarded, interruptions: 0 };
}

/**
 * Torso lift depends on camera height and how flat the athlete actually lies.
 * Derive the extended/entered thresholds from this session's own 10th/90th
 * percentile instead of assuming a fixed 0° baseline.
 */
function adaptProfile(profile: Profile, features: readonly Feature[]): Profile {
  if (profile.mode !== 'cycle' || profile.measure !== 'torsoLift') return profile;
  const lifts = features.filter(frame => frame.angle !== null).map(frame => frame.angle!);
  if (lifts.length < 8) return profile;
  const low = percentile(lifts, 0.1);
  const high = percentile(lifts, 0.9);
  const span = high - low;
  if (span < 10) return profile;
  const threshold = low + 0.25 * span;
  const enterAt = low + 0.45 * span;
  return Object.freeze({ ...profile, threshold, enterDelta: Math.max(2, enterAt - threshold) });
}

export class JointMotionPlugin extends Service implements FitnessMotion {
  static provide = 'fitnessMotion';
  constructor(ctx: Context) { super(ctx, 'fitnessMotion'); }

  analyze(poses: PoseSequence, request: MotionRequest): MotionAnalysis {
    if (!isSupportedExercise(request.exercise)) {
      throw new FitnessError('UNSUPPORTED_EXERCISE', `动作分析暂不支持：${request.exercise}`);
    }
    if (!Number.isInteger(request.targetRepetitions) || request.targetRepetitions < 1 || request.targetRepetitions > 10_000
      || !request.sessionId.trim() || request.sessionId.length > 128 || !poses.frames.length) {
      throw new FitnessError('INVALID_WORKOUT', '动作分析请求缺少有效目标次数、会话标识或骨架帧');
    }
    const baseProfile = PROFILES[request.exercise];
    const extracted = extract(poses, baseProfile, request.exercise);
    const features = Object.freeze(extracted.features.map(frame => Object.freeze({
      frameIndex: frame.frameIndex,
      timestampMs: frame.timestampMs,
      angle: frame.angle,
      confidence: frame.confidence,
      torsoInclination: frame.torsoInclination,
      bodyAlignment: frame.bodyAlignment,
      ...(frame.signal === null ? {} : { signal: frame.signal }),
    })));
    const profile = adaptProfile(baseProfile, extracted.features);
    type Detected = { repetitions: readonly MotionRepetition[]; discarded: number; interruptions: number; holds?: readonly MotionHold[] };
    const detected: Detected = profile.mode === 'cycle'
      ? detectCycle(extracted.features, profile)
      : profile.mode === 'hold'
        ? (profile.variant === 'plank' ? detectPlankHolds(extracted.features, profile) : detectBalanceHolds(extracted.features, profile))
        : profile.mode === 'reach'
          ? detectReachHolds(extracted.features, profile)
          : detectOscillation(extracted.features, profile);
    const holds = detected.holds;
    const interruptions = detected.interruptions;
    const repetitions = detected.repetitions;
    const validFrames = extracted.features.filter(frame => frame.angle !== null).length;
    const warnings: string[] = [];
    if (extracted.features.length - validFrames > 0) warnings.push(`${extracted.features.length - validFrames} 帧因关键点置信度不足、越界或退化几何被排除`);
    if (interruptions) warnings.push(`${interruptions} 个动作片段因超过 350ms 的有效帧间隔被中断`);
    if (detected.discarded) warnings.push(`${detected.discarded} 个片段未满足完整往返、幅度或时长要求，未计次`);
    if (!repetitions.length) {
      warnings.push(profile.mode === 'hold' || profile.mode === 'reach'
        ? '没有检测到满足姿势与时长要求的连续保持片段；不能据此产生运动评分'
        : '没有检测到可信的完整动作周期；不能据此产生运动评分');
    }
    const workout = Object.freeze({
      schemaVersion: '1.0' as const, sessionId: request.sessionId, exercise: request.exercise,
      targetRepetitions: request.targetRepetitions, repetitions: Object.freeze(repetitions),
    });
    const base = {
      schemaVersion: '1.0' as const,
      policy: Object.freeze({ id: `joint-${profile.mode}-${request.exercise}`, version: profile.policyVersion, kind: 'heuristic' as const }),
      exercise: request.exercise, side: extracted.side, validFrames, rejectedFrames: extracted.features.length - validFrames,
      repetitions: Object.freeze(repetitions), features, warnings: Object.freeze(warnings), workout,
    };
    const result: MotionAnalysis = Object.freeze(holds ? { ...base, holds: Object.freeze(holds) } : base);
    this.ctx.emit('fitness/motion-produced', result);
    return result;
  }
}
