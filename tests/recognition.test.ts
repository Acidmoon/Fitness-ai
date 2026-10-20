import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import { MoveNetPlugin } from '../src/plugins/movenet.ts';
import { createRuntime } from '../src/runtime.ts';

const config = {
  python: process.execPath, pythonArgs: [],
  workerPath: fileURLToPath(new URL('./fixtures/pose-worker.ts', import.meta.url)),
  timeoutMs: 5000,
};
const video = (path: string) => ({ path, name: `${path}.mp4`, bytes: 1 });
const code = (expected: string) => (error: unknown) => error instanceof FitnessError && error.code === expected;

test('recognition publishes validated canonical poses', async () => {
  const ctx = createRuntime();
  let events = 0;
  try {
    await ctx.plugin(MoveNetPlugin, config);
    ctx.on('fitness/pose-produced', () => { events++; });
    const result = await ctx.fitnessPose.estimate(video('valid'));
    assert.equal(result.frames[0]!.keypoints.length, 17);
    assert.ok(Object.isFrozen(result));
    assert.equal(events, 1);
  } finally { await ctx.fiber.dispose(); }
});

for (const [path, expected] of [['malformed', 'POSE_INVALID'], ['failed', 'VIDEO_INVALID']] as const) {
  test(`recognition propagates ${path} worker failures`, async () => {
    const ctx = createRuntime();
    try {
      await ctx.plugin(MoveNetPlugin, config);
      await assert.rejects(ctx.fitnessPose.estimate(video(path)), code(expected));
    } finally { await ctx.fiber.dispose(); }
  });
}

test('recognition worker timeout terminates the operation', { timeout: 5000 }, async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(MoveNetPlugin, { ...config, timeoutMs: 100 });
    await assert.rejects(ctx.fitnessPose.estimate(video('slow')), code('INFERENCE_FAILED'));
  } finally { await ctx.fiber.dispose(); }
});

test('unloading recognition cancels active work and emits no result', { timeout: 5000 }, async () => {
  const ctx = createRuntime();
  let events = 0;
  try {
    const fiber = await ctx.plugin(MoveNetPlugin, config);
    ctx.on('fitness/pose-produced', () => { events++; });
    const rejected = assert.rejects(ctx.fitnessPose.estimate(video('slow')), code('CANCELLED'));
    await fiber.dispose();
    await rejected;
    assert.equal(events, 0);
  } finally { await ctx.fiber.dispose(); }
});

test('recognition enforces concurrency limits and cleans up both workers', { timeout: 5000 }, async () => {
  const ctx = createRuntime();
  try {
    const fiber = await ctx.plugin(MoveNetPlugin, config);
    const first = assert.rejects(ctx.fitnessPose.estimate(video('slow')), code('CANCELLED'));
    const second = assert.rejects(ctx.fitnessPose.estimate(video('slow')), code('CANCELLED'));
    await assert.rejects(ctx.fitnessPose.estimate(video('slow')), code('INFERENCE_BUSY'));
    await fiber.dispose();
    await Promise.all([first, second]);
  } finally { await ctx.fiber.dispose(); }
});

test('missing Python runtime reports an actionable model error', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(MoveNetPlugin, { ...config, python: 'fitness-ai-python-does-not-exist' });
    await assert.rejects(ctx.fitnessPose.estimate(video('valid')), code('MODEL_UNAVAILABLE'));
  } finally { await ctx.fiber.dispose(); }
});
