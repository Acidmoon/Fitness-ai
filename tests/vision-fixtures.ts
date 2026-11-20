import { KEYPOINT_NAMES, type Keypoint, type PoseSequence, type SupportedExercise } from '../src/vision-contracts.ts';

export const CYCLE = [170, 170, 170, 150, 130, 100, 90, 90, 110, 140, 160, 170, 170];

export function makePoses(angles: readonly number[] = CYCLE, exercise: SupportedExercise = 'squat'): PoseSequence {
  return {
    schemaVersion: '1.0', coordinateSpace: 'image-pixels',
    model: { id: 'fixture-pose', sha256: '0'.repeat(64), inputSize: 192, inputDtype: 'uint8', runtime: 'fixture' },
    video: {
      name: 'fixture.mp4', width: 1000, height: 1000, sourceFps: 10,
      totalFrames: angles.length, decodedFrames: angles.length, durationMs: angles.length * 100,
      rotationDegrees: 0, timestampSource: 'decoder-pts',
    },
    sampling: { requestedFps: 10, sampledFrames: angles.length },
    performance: { elapsedMs: 1, inferenceMs: 1 },
    frames: angles.map((angle, index) => {
      const radians = angle * Math.PI / 180;
      const coordinates: Partial<Record<Keypoint['name'], [number, number]>> = exercise === 'squat' ? {
        left_shoulder: [500, 150], left_hip: [500, 300], left_knee: [500, 500],
        left_ankle: [500 + 200 * Math.sin(radians), 500 - 200 * Math.cos(radians)],
      } : {
        left_shoulder: [300, 300], left_elbow: [500, 300],
        left_wrist: [500 - 200 * Math.cos(radians), 300 + 200 * Math.sin(radians)],
        left_hip: [650, 300], left_ankle: [900, 300],
      };
      return {
        frameIndex: index, timestampMs: index * 100,
        keypoints: KEYPOINT_NAMES.map(name => ({
          name, x: coordinates[name]?.[0] ?? 100, y: coordinates[name]?.[1] ?? 100,
          confidence: name.startsWith('right_') ? 0.5 : 0.9,
        })),
      };
    }),
  };
}

/** Build a pose sequence from absolute keypoint coordinates; specified points get 0.9 confidence. */
export function makeFrames(
  series: readonly Record<string, readonly [number, number]>[],
  stepMs = 100,
  options: { readonly bilateral?: boolean; readonly confidence?: number } = {},
): PoseSequence {
  const high = options.confidence ?? 0.9;
  return {
    schemaVersion: '1.0', coordinateSpace: 'image-pixels',
    model: { id: 'fixture-pose', sha256: '0'.repeat(64), inputSize: 192, inputDtype: 'uint8', runtime: 'fixture' },
    video: {
      name: 'fixture.mp4', width: 1000, height: 1000, sourceFps: 10,
      totalFrames: series.length, decodedFrames: series.length, durationMs: series.length * stepMs,
      rotationDegrees: 0, timestampSource: 'decoder-pts',
    },
    sampling: { requestedFps: 10, sampledFrames: series.length },
    performance: { elapsedMs: 1, inferenceMs: 1 },
    frames: series.map((coordinates, index) => ({
      frameIndex: index, timestampMs: index * stepMs,
      keypoints: KEYPOINT_NAMES.map(name => ({
        name,
        x: coordinates[name]?.[0] ?? 100,
        y: coordinates[name]?.[1] ?? 100,
        confidence: options.bilateral
          ? (coordinates[name] ? high : 0.5)
          : (name.startsWith('right_') ? 0.5 : high),
      })),
    })),
  };
}

/** Torso lift in degrees for crunch/sit-up: 0 = lying flat, 90 = sitting upright. */
export function crunchSeries(lifts: readonly number[], hip: [number, number] = [500, 700]): Record<string, [number, number]>[] {
  return lifts.map(lift => {
    const radians = lift * Math.PI / 180;
    return {
      left_shoulder: [hip[0] + 200 * Math.cos(radians), hip[1] - 200 * Math.sin(radians)],
      left_hip: hip, left_knee: [hip[0] + 150, hip[1] - 50], left_ankle: [hip[0] + 300, hip[1]],
    };
  });
}

/** Straight plank line; `sag` bends the hip downward from 180°. */
export function plankSeries(frames: number, sag = 0): Record<string, [number, number]>[] {
  return Array.from({ length: frames }, () => ({
    left_shoulder: [300, 600], left_hip: [500, 600 + sag], left_knee: [600, 600 + sag], left_ankle: [700, 600],
  }));
}

/** Vertical hip oscillation; one jump spans `perJump` frames. */
export function jumpSeries(jumps: number, perJump = 8, amplitude = 20): Record<string, [number, number]>[] {
  const offsets = [amplitude, amplitude / 2, 0, -amplitude / 2, -amplitude, -amplitude / 2, 0, amplitude / 2];
  const series: Record<string, [number, number]>[] = [];
  for (let jump = 0; jump < jumps; jump++) {
    for (let index = 0; index < perJump; index++) {
      const y = 450 + offsets[index % offsets.length]!;
      series.push({ left_shoulder: [500, 250], left_hip: [500, y], left_ankle: [500, 650] });
    }
  }
  return series;
}

/**
 * Side-view seated sit-and-reach: hip at (300, 700), legs extending right along +x.
 * `hipAngleDeg` controls trunk flexion toward the thighs (smaller = deeper forward reach).
 * `kneeBendPx` raises the knee upward to simulate bent knees.
 */
export function sitAndReachSeries(
  frames: number,
  options: {
    readonly hipAngleDeg?: number;
    readonly kneeBendPx?: number;
    readonly reachRatio?: number;
    readonly bounceDeg?: number;
    readonly legDropPx?: number;
  } = {},
): Record<string, [number, number]>[] {
  const baseHipAngle = options.hipAngleDeg ?? 50;
  const kneeBendPx = options.kneeBendPx ?? 0;
  const reachRatio = options.reachRatio ?? 1.05;
  const bounceDeg = options.bounceDeg ?? 0;
  const legDropPx = options.legDropPx ?? 0;
  const hip: [number, number] = [300, 700];
  const ankle: [number, number] = [700, 700 + legDropPx];
  const knee: [number, number] = [500, 700 - kneeBendPx + legDropPx / 2];
  const legDx = ankle[0] - hip[0];
  const legDy = ankle[1] - hip[1];

  return Array.from({ length: frames }, (_, index) => {
    const hipAngle = baseHipAngle + (bounceDeg ? (index % 2 === 0 ? bounceDeg : -bounceDeg) : 0);
    const radians = hipAngle * Math.PI / 180;
    return {
      left_hip: hip,
      left_knee: knee,
      left_ankle: ankle,
      left_shoulder: [hip[0] + 220 * Math.cos(radians), hip[1] - 220 * Math.sin(radians)],
      left_wrist: [hip[0] + reachRatio * legDx, hip[1] + reachRatio * legDy - 25],
    };
  });
}

/**
 * Bilateral upright single-leg balance hold.
 * `ankleLiftPx` lifts the non-standing ankle upward (smaller y) from the floor y=800.
 */
export function balanceSeries(
  frames: number,
  options: {
    readonly ankleLiftPx?: number;
    readonly torsoTiltDeg?: number;
    readonly swayDeg?: number;
    readonly standingSide?: 'left' | 'right';
    readonly horizontal?: boolean;
  } = {},
): Record<string, [number, number]>[] {
  const ankleLiftPx = options.ankleLiftPx ?? 80;
  const baseTilt = options.torsoTiltDeg ?? 0;
  const swayDeg = options.swayDeg ?? 0;
  const standingSide = options.standingSide ?? 'left';

  return Array.from({ length: frames }, (_, index) => {
    if (options.horizontal) {
      return {
        left_shoulder: [250, 500], right_shoulder: [250, 540],
        left_hip: [500, 500], right_hip: [500, 540],
        left_ankle: [750, 500], right_ankle: [750, 440],
      };
    }
    const tilt = baseTilt + (swayDeg ? (index % 2 === 0 ? swayDeg : -swayDeg) : 0);
    const radians = tilt * Math.PI / 180;
    const midHipX = 500;
    const midHipY = 500;
    const torsoLen = 220;
    const midShoulderX = midHipX + torsoLen * Math.sin(radians);
    const midShoulderY = midHipY - torsoLen * Math.cos(radians);
    const leftAnkleY = standingSide === 'left' ? 800 : 800 - ankleLiftPx;
    const rightAnkleY = standingSide === 'right' ? 800 : 800 - ankleLiftPx;
    return {
      left_shoulder: [midShoulderX - 40, midShoulderY],
      right_shoulder: [midShoulderX + 40, midShoulderY],
      left_hip: [midHipX - 30, midHipY],
      right_hip: [midHipX + 30, midHipY],
      left_ankle: [midHipX - 25, leftAnkleY],
      right_ankle: [midHipX + 25, rightAnkleY],
    };
  });
}
