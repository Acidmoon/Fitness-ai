import assert from 'node:assert/strict';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import { parsePoseSequence } from '../src/pose-validation.ts';
import { JointMotionPlugin, jointAngle } from '../src/plugins/joint-motion.ts';
import { createRuntime } from '../src/runtime.ts';
import { CYCLE, makePoses } from './vision-fixtures.ts';
import type { Keypoint, SupportedExercise } from '../src/vision-contracts.ts';

for (const exercise of ['squat', 'push-up'] as SupportedExercise[]) {
  test(`${exercise} converts one complete cycle to bounded scoring metrics`, async () => {
    const ctx = createRuntime();
    try {
      await ctx.plugin(JointMotionPlugin);
      const result = ctx.fitnessMotion.analyze(makePoses(CYCLE, exercise), {
        exercise, sessionId: 'cycle-test', targetRepetitions: 1,
      });
      assert.equal(result.repetitions.length, 1);
      const rep = result.repetitions[0]!;
      assert.ok(rep.startMs < rep.bottomMs && rep.bottomMs < rep.endMs);
      assert.ok(rep.durationMs >= 500);
      assert.ok(rep.rangeOfMotion > 0.8 && rep.rangeOfMotion <= 1);
      assert.ok(rep.stability >= 0 && rep.stability <= 1);
      assert.ok(rep.confidence >= 0.6);
      assert.equal(result.side, 'left');
      assert.equal(result.workout.exercise, exercise);
      assert.ok(Object.isFrozen(result.repetitions));
    } finally { await ctx.fiber.dispose(); }
  });
}

test('partial movements and top-position jitter do not manufacture repetitions', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    for (const angles of [[170, 170, 150, 120, 90, 90], [170, 165, 158, 155, 162, 170], [90, 90, 100, 140, 170, 170]]) {
      const result = ctx.fitnessMotion.analyze(makePoses(angles), { exercise: 'squat', sessionId: 'partial', targetRepetitions: 1 });
      assert.equal(result.repetitions.length, 0);
    }
  } finally { await ctx.fiber.dispose(); }
});

test('a shallow return cycle is recorded with low range rather than treated as no movement', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const result = ctx.fitnessMotion.analyze(makePoses([175, 175, 175, 150, 140, 135, 135, 140, 155, 170, 175]), {
      exercise: 'squat', sessionId: 'shallow', targetRepetitions: 1,
    });
    assert.equal(result.repetitions.length, 1);
    assert.ok(result.repetitions[0]!.rangeOfMotion < 0.8);
  } finally { await ctx.fiber.dispose(); }
});

test('occlusion gaps cannot connect two half movements into one repetition', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const poses = makePoses();
    const occluded = {
      ...poses, frames: poses.frames.map((frame, index) => index >= 5 && index <= 9 ? {
        ...frame, keypoints: frame.keypoints.map(point => ({ ...point, confidence: 0.1 })),
      } : frame),
    };
    const result = ctx.fitnessMotion.analyze(occluded, { exercise: 'squat', sessionId: 'occluded', targetRepetitions: 1 });
    assert.equal(result.repetitions.length, 0);
    assert.equal(result.rejectedFrames, 5);
    assert.ok(result.warnings.some(message => message.includes('中断')));
  } finally { await ctx.fiber.dispose(); }
});

test('motion state belongs to each call rather than the plugin instance', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const request = { exercise: 'squat' as const, sessionId: 'independent', targetRepetitions: 1 };
    ctx.fitnessMotion.analyze(makePoses([170, 170, 150, 100, 90]), request);
    assert.equal(ctx.fitnessMotion.analyze(makePoses([90, 100, 140, 170, 170]), request).repetitions.length, 0);
    assert.equal(ctx.fitnessMotion.analyze(makePoses(), request).repetitions.length, 1);
  } finally { await ctx.fiber.dispose(); }
});

test('joint angles use Euclidean image geometry and reject degenerate segments', () => {
  const point = (x: number, y: number): Keypoint => ({ name: 'nose', x, y, confidence: 1 });
  assert.equal(jointAngle(point(0, 100), point(0, 0), point(200, 0)), 90);
  assert.equal(jointAngle(point(0, 0), point(0, 0), point(200, 0)), null);
});

test('canonical pose validation freezes a sequence and accepts out-of-image points as evidence', () => {
  const poses = makePoses();
  const value = { ...poses, frames: poses.frames.map(frame => ({
    ...frame, region: { x: -10, y: 0, width: 1000, height: 1000 },
    keypoints: frame.keypoints.map(point => ({ ...point, x: point.name === 'nose' ? -5 : point.x })),
  })) };
  const parsed = parsePoseSequence(value);
  assert.ok(Object.isFrozen(parsed.frames[0]!.keypoints[0]));
  assert.ok(Object.isFrozen(parsed.frames[0]!.region));
  assert.equal(parsed.frames[0]!.keypoints[0]!.x, -5);
});

for (const mutation of ['names', 'time', 'nan', 'incomplete', 'count'] as const) {
  test(`pose boundary rejects invalid ${mutation}`, () => {
    const poses = structuredClone(makePoses());
    const raw = poses as unknown as { video: { decodedFrames: number }; frames: { timestampMs: number; keypoints: { name: string; x: number }[] }[]; sampling: { sampledFrames: number } };
    if (mutation === 'names') raw.frames[0]!.keypoints[0]!.name = 'unknown';
    if (mutation === 'time') raw.frames[1]!.timestampMs = 0;
    if (mutation === 'nan') raw.frames[0]!.keypoints[0]!.x = NaN;
    if (mutation === 'incomplete') raw.video.decodedFrames -= 1;
    if (mutation === 'count') raw.sampling.sampledFrames -= 1;
    assert.throws(() => parsePoseSequence(raw), error => error instanceof FitnessError && error.code === 'POSE_INVALID');
  });
}
