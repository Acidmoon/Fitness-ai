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
