import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import { createRuntime } from '../src/runtime.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';

function valid() {
  return {
    schemaVersion: '1.0', sessionId: 'input-test', exercise: 'squat', targetRepetitions: 1,
    repetitions: [{ rangeOfMotion: 0.8, stability: 0.9, durationMs: 3000, confidence: 0.95 }],
  };
}

const invalidInputs: [string, unknown][] = [
  ['null input', null],
  ['unknown version', { ...valid(), schemaVersion: '2.0' }],
  ['empty session id', { ...valid(), sessionId: ' ' }],
  ['fractional target', { ...valid(), targetRepetitions: 1.5 }],
  ['zero target', { ...valid(), targetRepetitions: 0 }],
  ['empty observations', { ...valid(), repetitions: [] }],
  ['missing metric', { ...valid(), repetitions: [{ durationMs: 3000 }] }],
  ['out-of-range metric', { ...valid(), repetitions: [{ ...valid().repetitions[0], stability: 1.1 }] }],
  ['non-finite metric', { ...valid(), repetitions: [{ ...valid().repetitions[0], confidence: Number.NaN }] }],
  ['zero duration', { ...valid(), repetitions: [{ ...valid().repetitions[0], durationMs: 0 }] }],
  ['oversized record list', { ...valid(), repetitions: Array(10_001).fill(valid().repetitions[0]) }],
];

for (const [label, value] of invalidInputs) {
  test(`input rejects ${label}`, async () => {
    const ctx = createRuntime();
    try {
      await ctx.plugin(WorkoutInputPlugin);
      assert.throws(() => ctx.fitnessInput.parse(value), error =>
        error instanceof FitnessError && error.code === 'INVALID_WORKOUT');
    } finally {
      await ctx.fiber.dispose();
    }
  });
}

test('input normalization copies and freezes observations', async () => {
  const ctx = createRuntime();
  try {
    await ctx.plugin(WorkoutInputPlugin);
    const original = valid();
    const parsed = ctx.fitnessInput.parse(original);
    original.repetitions[0]!.stability = 0;
    assert.equal(parsed.repetitions[0]!.stability, 0.9);
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(parsed.repetitions));
    assert.ok(Object.isFrozen(parsed.repetitions[0]));
  } finally {
    await ctx.fiber.dispose();
  }
});

test('file input accepts a UTF-8 BOM and reports JSON and IO errors separately', async () => {
  const ctx = createRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'fitness-ai-test-'));
  try {
    await ctx.plugin(WorkoutInputPlugin);
    const path = join(directory, 'workout.json');
    await writeFile(path, `\uFEFF${JSON.stringify(valid())}`, 'utf8');
    assert.deepEqual(await ctx.fitnessInput.load(path), valid());
    await writeFile(path, '{invalid', 'utf8');
    await assert.rejects(ctx.fitnessInput.load(path), error =>
      error instanceof FitnessError && error.code === 'INVALID_JSON');
    await assert.rejects(ctx.fitnessInput.load(join(directory, 'missing.json')), error =>
      error instanceof FitnessError && error.code === 'INPUT_IO');
  } finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
