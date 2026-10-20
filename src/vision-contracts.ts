import type { AssessmentResult, PolicyReference, Repetition, WorkoutSession } from './contracts.ts';

export const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;
export type KeypointName = typeof KEYPOINT_NAMES[number];
export type SupportedExercise = 'squat' | 'push-up';

export interface VideoFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
}

export interface Keypoint {
  readonly name: KeypointName;
  readonly x: number;
  readonly y: number;
  readonly confidence: number;
}

export interface PoseFrame {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly keypoints: readonly Keypoint[];
  readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface PoseSequence {
  readonly schemaVersion: '1.0';
  readonly coordinateSpace: 'image-pixels';
  readonly model: {
    readonly id: string;
    readonly sha256: string;
    readonly inputSize: number;
    readonly inputDtype: string;
    readonly runtime: string;
    readonly preprocessing?: string;
  };
  readonly video: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly sourceFps: number;
    readonly totalFrames: number;
    readonly decodedFrames: number;
    readonly durationMs: number;
    readonly rotationDegrees: number;
    readonly timestampSource: 'decoder-pts';
  };
  readonly sampling: { readonly requestedFps: number; readonly sampledFrames: number };
  readonly performance: { readonly elapsedMs: number; readonly inferenceMs: number };
  readonly frames: readonly PoseFrame[];
}

export interface PoseOptions {
  readonly sampleFps?: number;
}

export interface MotionRequest {
  readonly exercise: SupportedExercise;
  readonly targetRepetitions: number;
  readonly sessionId: string;
}

export interface MotionFrame {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly angle: number | null;
  readonly confidence: number;
  readonly torsoInclination: number | null;
  readonly bodyAlignment: number | null;
}

export interface MotionRepetition extends Repetition {
  readonly startMs: number;
  readonly bottomMs: number;
  readonly endMs: number;
  readonly minAngle: number;
  readonly maxAngle: number;
}

export interface MotionAnalysis {
  readonly schemaVersion: '1.0';
  readonly policy: PolicyReference;
  readonly exercise: SupportedExercise;
  readonly side: 'left' | 'right';
  readonly validFrames: number;
  readonly rejectedFrames: number;
  readonly repetitions: readonly MotionRepetition[];
  readonly features: readonly MotionFrame[];
  readonly warnings: readonly string[];
  readonly workout: WorkoutSession;
}

export type ArtifactName = 'poses.json' | 'motion.json' | 'workout.json' | 'assessment.json';

export interface VideoAssessmentRequest extends MotionRequest, PoseOptions {
  readonly path: string;
  readonly artifactDirectory?: string;
}

export interface VideoAssessmentResult {
  readonly poses: PoseSequence;
  readonly motion: MotionAnalysis;
  readonly assessment: AssessmentResult;
}

export interface FitnessFiles {
  openVideo(path: string): Promise<VideoFile>;
}
export interface FitnessPose {
  estimate(video: VideoFile, options?: PoseOptions): Promise<PoseSequence>;
}
export interface FitnessMotion {
  analyze(poses: PoseSequence, request: MotionRequest): MotionAnalysis;
}
export interface FitnessArtifacts {
  save(directory: string, name: ArtifactName, value: unknown): Promise<void>;
}
export interface FitnessVideo {
  assess(request: VideoAssessmentRequest): Promise<VideoAssessmentResult>;
}

declare module 'cordis' {
  interface Context {
    fitnessFiles: FitnessFiles;
    fitnessPose: FitnessPose;
    fitnessMotion: FitnessMotion;
    fitnessArtifacts: FitnessArtifacts;
    fitnessVideo: FitnessVideo;
  }
  interface Events {
    'fitness/pose-produced'(result: PoseSequence): void;
    'fitness/motion-produced'(result: MotionAnalysis): void;
  }
}
