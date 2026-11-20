import assert from 'node:assert/strict';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import { parsePoseSequence } from '../src/pose-validation.ts';
import { JointMotionPlugin, jointAngle } from '../src/plugins/joint-motion.ts';
import { createRuntime } from '../src/runtime.ts';
import {
  CYCLE, balanceSeries, crunchSeries, frontSquatSeries, jumpSeries, makeFrames, makePoses,
  obliquePushUpSeries, plankSeries, sitAndReachSeries,
} from './vision-fixtures.ts';
import type { Keypoint, SupportedExercise } from '../src/vision-contracts.ts';

for (const exercise of ['squat', 'push-up'] as SupportedExercise[]) {
  test(`${exercise} converts one complete cycle to bounded scoring metrics`, async () => {
    const ctx = createRuntime();
    try {
      await ctx.plugin(JointMotionPlugin);
      const result = ctx.fitnessMotion.analyze(makePoses(CYCLE, exercise), {
        exercise, sessionId: 'cycle-test', targetRepetitions: 1,
      });
      assert.equal(result.policy.id, `joint-cycle-${exercise}`);
      assert.equal(result.policy.version, '0.3.0');
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

test('crunch counts torso-lift cycles and rejects jitter below the 20 degree range', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const lifts = [5, 5, 5, 20, 35, 45, 45, 35, 20, 5, 5];
    const result = ctx.fitnessMotion.analyze(makeFrames(crunchSeries(lifts)), {
      exercise: 'crunch', sessionId: 'crunch', targetRepetitions: 1,
    });
    assert.equal(result.repetitions.length, 1);
    assert.equal(result.policy.id, 'joint-cycle-crunch');
    assert.ok((result.repetitions[0]!.maxAngle ?? 0) - (result.repetitions[0]!.minAngle ?? 0) >= 20);
    const shallow = ctx.fitnessMotion.analyze(makeFrames(crunchSeries([5, 5, 12, 18, 18, 12, 5, 5])), {
      exercise: 'crunch', sessionId: 'shallow-crunch', targetRepetitions: 1,
    });
    assert.equal(shallow.repetitions.length, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('sit-up needs a larger torso range than crunch', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const partial = [5, 5, 20, 20, 35, 40, 40, 35, 20, 20, 5, 5];
    assert.equal(ctx.fitnessMotion.analyze(makeFrames(crunchSeries(partial)), {
      exercise: 'crunch', sessionId: 'partial', targetRepetitions: 1,
    }).repetitions.length, 1);
    assert.equal(ctx.fitnessMotion.analyze(makeFrames(crunchSeries(partial)), {
      exercise: 'sit-up', sessionId: 'partial-situp', targetRepetitions: 1,
    }).repetitions.length, 0);
    const full = ctx.fitnessMotion.analyze(makeFrames(crunchSeries([5, 5, 40, 70, 80, 70, 40, 5, 5, 5, 5])), {
      exercise: 'sit-up', sessionId: 'full-situp', targetRepetitions: 1,
    });
    assert.equal(full.repetitions.length, 1);
    assert.equal(full.policy.id, 'joint-cycle-sit-up');
  } finally { await ctx.fiber.dispose(); }
});

test('plank reports static holds only when alignment, continuity, and duration qualify', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const short = ctx.fitnessMotion.analyze(makeFrames(plankSeries(20)), {
      exercise: 'plank', sessionId: 'short-plank', targetRepetitions: 30,
    });
    assert.equal(short.repetitions.length, 0);
    assert.equal(short.holds?.length ?? 0, 0);

    const held = ctx.fitnessMotion.analyze(makeFrames(plankSeries(60)), {
      exercise: 'plank', sessionId: 'plank', targetRepetitions: 30,
    });
    assert.equal(held.policy.id, 'joint-hold-plank');
    assert.equal(held.repetitions.length, 1);
    assert.equal(held.holds?.length, 1);
    assert.ok(held.holds![0]!.durationMs >= 5_000);
    assert.ok(held.repetitions[0]!.rangeOfMotion > 0.9);
    assert.ok(held.repetitions[0]!.alignment !== undefined && held.repetitions[0]!.alignment > 0.9);

    const sagging = ctx.fitnessMotion.analyze(makeFrames(plankSeries(60, 80)), {
      exercise: 'plank', sessionId: 'sag', targetRepetitions: 30,
    });
    assert.equal(sagging.repetitions.length, 0);

    // A >350ms occlusion gap splits two valid holds cleanly without losing the second hold.
    const base = makeFrames(plankSeries(90));
    const gapped = {
      ...base,
      frames: base.frames.map((frame, index) => index >= 40 && index <= 45 ? {
        ...frame, keypoints: frame.keypoints.map(point => ({ ...point, confidence: 0.1 })),
      } : frame),
    };
    const split = ctx.fitnessMotion.analyze(gapped, {
      exercise: 'plank', sessionId: 'split-plank', targetRepetitions: 30,
    });
    assert.equal(split.holds?.length, 2);
    assert.equal(split.repetitions.length, 2);
    assert.ok(split.warnings.some(message => message.includes('中断')));
  } finally { await ctx.fiber.dispose(); }
});

test('jump rope counts vertical cycles and scores rhythm separately from joint steadiness', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const result = ctx.fitnessMotion.analyze(makeFrames(jumpSeries(5)), {
      exercise: 'jump-rope', sessionId: 'rope', targetRepetitions: 5,
    });
    assert.ok(result.repetitions.length >= 3, `expected several jumps, got ${result.repetitions.length}`);
    for (const rep of result.repetitions) {
      assert.ok(rep.amplitude !== undefined && rep.amplitude > 0.03);
      assert.ok(rep.rangeOfMotion > 0 && rep.rangeOfMotion <= 1);
    }
    assert.equal(result.policy.id, 'joint-oscillation-jump-rope');
  } finally { await ctx.fiber.dispose(); }
});

test('sit-and-reach validates seated forward flexion holds, rejects bent knees or short reaches, and penalizes bouncing', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const steady = ctx.fitnessMotion.analyze(makeFrames(sitAndReachSeries(25, { hipAngleDeg: 45, reachRatio: 1.05 })), {
      exercise: 'sit-and-reach', sessionId: 'reach-steady', targetRepetitions: 1,
    });
    assert.equal(steady.policy.id, 'joint-reach-sit-and-reach');
    assert.equal(steady.repetitions.length, 1);
    assert.equal(steady.holds?.length, 1);
    const rep = steady.repetitions[0]!;
    assert.ok(rep.durationMs >= 1_500);
    assert.ok(rep.minAngle !== undefined && rep.minAngle < 50);
    assert.ok(rep.amplitude !== undefined && rep.amplitude > 1.0);
    assert.ok(rep.alignment !== undefined && rep.alignment > 0.9);
    assert.ok(rep.rangeOfMotion > 0.85);
    assert.ok(rep.stability > 0.95);

    // Bouncing forward/backward reduces stability.
    const bouncing = ctx.fitnessMotion.analyze(
      makeFrames(sitAndReachSeries(25, { hipAngleDeg: 55, reachRatio: 0.95, bounceDeg: 14 })),
      { exercise: 'sit-and-reach', sessionId: 'reach-bounce', targetRepetitions: 1 },
    );
    assert.equal(bouncing.repetitions.length, 1);
    assert.ok(bouncing.repetitions[0]!.stability < steady.repetitions[0]!.stability);

    // Bent knees (< 145 deg), upright sitting, too short (< 1.5s), and low confidence are rejected.
    const bentKnees = ctx.fitnessMotion.analyze(makeFrames(sitAndReachSeries(25, { kneeBendPx: 140 })), {
      exercise: 'sit-and-reach', sessionId: 'reach-bent', targetRepetitions: 1,
    });
    assert.equal(bentKnees.repetitions.length, 0);

    const upright = ctx.fitnessMotion.analyze(makeFrames(sitAndReachSeries(25, { hipAngleDeg: 95, reachRatio: 0.2 })), {
      exercise: 'sit-and-reach', sessionId: 'reach-upright', targetRepetitions: 1,
    });
    assert.equal(upright.repetitions.length, 0);

    const tooShort = ctx.fitnessMotion.analyze(makeFrames(sitAndReachSeries(10)), {
      exercise: 'sit-and-reach', sessionId: 'reach-short', targetRepetitions: 1,
    });
    assert.equal(tooShort.repetitions.length, 0);

    const lowConf = ctx.fitnessMotion.analyze(makeFrames(sitAndReachSeries(25), 100, { confidence: 0.2 }), {
      exercise: 'sit-and-reach', sessionId: 'reach-low-conf', targetRepetitions: 1,
    });
    assert.equal(lowConf.repetitions.length, 0);
    assert.equal(lowConf.validFrames, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('balance detects single-leg stance holds, rejects two-foot standing or lean, and penalizes torso sway', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const steady = ctx.fitnessMotion.analyze(
      makeFrames(balanceSeries(45, { ankleLiftPx: 90, torsoTiltDeg: 2, standingSide: 'right' }), 100, { bilateral: true }),
      { exercise: 'balance', sessionId: 'balance-steady', targetRepetitions: 20 },
    );
    assert.equal(steady.policy.id, 'joint-hold-balance');
    assert.equal(steady.side, 'right');
    assert.equal(steady.repetitions.length, 1);
    assert.equal(steady.holds?.length, 1);
    assert.ok(steady.holds![0]!.durationMs >= 4_000);
    assert.ok(steady.repetitions[0]!.alignment !== undefined && steady.repetitions[0]!.alignment > 0.85);
    assert.ok(steady.repetitions[0]!.stability > 0.9);

    // Swaying torso decreases stability compared to steady stance.
    const swaying = ctx.fitnessMotion.analyze(
      makeFrames(balanceSeries(45, { ankleLiftPx: 90, torsoTiltDeg: 6, swayDeg: 10 }), 100, { bilateral: true }),
      { exercise: 'balance', sessionId: 'balance-sway', targetRepetitions: 20 },
    );
    assert.equal(swaying.repetitions.length, 1);
    assert.ok(swaying.repetitions[0]!.stability < steady.repetitions[0]!.stability);

    // Two-foot standing (no ankle lift), short hold (< 3s), excessive torso tilt, horizontal posture, or low confidence fail.
    for (const [label, frames] of [
      ['two-feet', makeFrames(balanceSeries(45, { ankleLiftPx: 0 }), 100, { bilateral: true })],
      ['short', makeFrames(balanceSeries(20, { ankleLiftPx: 90 }), 100, { bilateral: true })],
      ['tilted', makeFrames(balanceSeries(45, { ankleLiftPx: 90, torsoTiltDeg: 35 }), 100, { bilateral: true })],
      ['horizontal', makeFrames(balanceSeries(45, { horizontal: true }), 100, { bilateral: true })],
      ['low-conf', makeFrames(balanceSeries(45, { ankleLiftPx: 90 }), 100, { bilateral: true, confidence: 0.2 })],
    ] as const) {
      const result = ctx.fitnessMotion.analyze(frames, {
        exercise: 'balance', sessionId: `balance-${label}`, targetRepetitions: 20,
      });
      assert.equal(result.repetitions.length, 0, `expected 0 holds for ${label}`);
      assert.equal(result.holds?.length ?? 0, 0, `expected 0 MotionHold items for ${label}`);
    }
  } finally { await ctx.fiber.dispose(); }
});

test('front-view squats and oblique push-ups compensate for 2D foreshortening without hallucinating reps on static or unplanted clips', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    const frontSquat = ctx.fitnessMotion.analyze(makeFrames(frontSquatSeries()), {
      exercise: 'squat', sessionId: 'front-squat', targetRepetitions: 1,
    });
    assert.equal(frontSquat.policy.version, '0.3.0');
    assert.equal(frontSquat.repetitions.length, 1);
    assert.ok(frontSquat.repetitions[0]!.rangeOfMotion >= 0.7);
    assert.ok(frontSquat.warnings.some(message => message.includes('透视缩短')));

    const obliquePushUp = ctx.fitnessMotion.analyze(makeFrames(obliquePushUpSeries()), {
      exercise: 'push-up', sessionId: 'oblique-pushup', targetRepetitions: 1,
    });
    assert.equal(obliquePushUp.policy.version, '0.3.0');
    assert.equal(obliquePushUp.repetitions.length, 1);
    assert.ok(obliquePushUp.repetitions[0]!.rangeOfMotion >= 0.45);
    assert.ok(obliquePushUp.warnings.some(message => message.includes('透视缩短')));

    // Static standing with minor jitter must still produce 0 reps.
    const staticStanding = ctx.fitnessMotion.analyze(
      makeFrames(frontSquatSeries([0, 2, -1, 3, 1, 0, -2, 2, 1, 0, 1, -1])),
      { exercise: 'squat', sessionId: 'static-standing', targetRepetitions: 1 },
    );
    assert.equal(staticStanding.repetitions.length, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('unsupported exercise names are rejected with a stable error code', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(JointMotionPlugin);
    assert.throws(() => ctx.fitnessMotion.analyze(makePoses(), {
      exercise: 'burpee' as never, sessionId: 'x', targetRepetitions: 1,
    }), error => error instanceof FitnessError && error.code === 'UNSUPPORTED_EXERCISE');
  } finally { await ctx.fiber.dispose(); }
});
