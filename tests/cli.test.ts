import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
function run(args: string[]) {
  const result = spawnSync(process.execPath, ['src/main.ts', ...args], {
    cwd, encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  return result;
}

test('CLI writes one JSON report and exits successfully', () => {
  const result = run(['examples/squat-session.json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.sessionId, 'demo-squat-001');
  assert.equal(report.score.total, 78.81);
  assert.ok(report.advice.items.length > 0);
});

test('CLI prints help without a report', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pnpm start/);
  assert.equal(result.stderr, '');
});

test('CLI rejects incomplete or invalid video arguments before starting inference', () => {
  for (const args of [
    ['video'],
    ['video', 'sample.mp4', '--target', '5'],
    ['video', 'sample.mp4', '--exercise', 'squat', '--target', '0'],
    ['video', 'sample.mp4', '--exercise', 'squat', '--target', '5', '--unknown', 'x'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^INVALID_ARGUMENTS:/);
  }
});

test('CLI lists all catalog records and exposes explicit technique availability', () => {
  const manifest = run(['exercises', 'manifest']);
  assert.equal(manifest.status, 0, manifest.stderr);
  assert.equal(JSON.parse(manifest.stdout).counts.exercises, 876);
  const list = run(['exercises', 'list', '--query', 'squat', '--limit', '2']);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).items.length, 2);
  const standard = run(['exercises', 'standard', 'Alternate_Incline_Dumbbell_Curl']);
  assert.equal(standard.status, 0, standard.stderr);
  assert.equal(JSON.parse(standard.stdout).technique.status, 'unavailable');
  const detail = run(['exercises', 'show', '俯卧撑']);
  assert.equal(detail.status, 0, detail.stderr);
  assert.equal(JSON.parse(detail.stdout).id, 'Pushups');
});

test('CLI scores target completion without inventing movement quality', () => {
  const result = run(['exercises', 'score-goal', 'examples/exercise-goal.json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.total, 80);
  assert.equal(report.scoreKind, 'goal-completion');
  assert.equal(report.techniqueScore, null);
});

test('CLI rejects invalid catalog query options and missing standards arguments', () => {
  for (const args of [
    ['exercises'], ['exercises', 'standard'],
    ['exercises', 'list', '--limit', '2', '--limit', '3'],
    ['exercises', 'list', '--unknown', 'value'],
    ['exercises', 'list', 'constructor', 'value'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^INVALID_ARGUMENTS:/);
  }
  const badLimit = run(['exercises', 'list', '--limit', '101']);
  assert.equal(badLimit.status, 1);
  assert.match(badLimit.stderr, /^INVALID_EXERCISE_DATA:/);
});

test('CLI returns a nonzero exit code for missing arguments', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^INVALID_ARGUMENTS:/);
});

test('CLI returns a nonzero exit code for an unreadable input', () => {
  const result = run(['examples/does-not-exist.json']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^INPUT_IO:/);
});
