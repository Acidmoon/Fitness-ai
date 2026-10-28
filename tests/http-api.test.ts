import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { HttpApiPlugin, type HttpApiConfig } from '../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import { jsonResponse } from '../src/http-contracts.ts';
import { makePoses } from './vision-fixtures.ts';

class FixturePosePlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  private readonly poses: PoseSequence;
  constructor(ctx: Context, config: { poses: PoseSequence }) {
    super(ctx, 'fitnessPose');
    this.poses = config.poses;
  }
  async estimate(_video: VideoFile, _options?: PoseOptions): Promise<PoseSequence> {
    return this.poses;
  }
}

const pipeline = [
  VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin, JsonArtifactsPlugin,
  WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin,
];

interface RunningServer {
  readonly ctx: Context;
  readonly base: string;
  close(): Promise<void>;
}

async function start(config: Omit<HttpApiConfig, 'port' | 'onListening'> = {}): Promise<RunningServer> {
  const ctx = createRuntime();
  await ctx.plugin(FixturePosePlugin, { poses: makePoses() }).await();
  await mountPlugins(ctx, pipeline);
  let address: { host: string; port: number } | undefined;
  await ctx.plugin(HttpApiPlugin, {
    port: 0,
    onListening: value => { address = value; },
    ...config,
  }).await();
  if (!address) throw new Error('HTTP 插件未报告监听地址');
  return {
    ctx,
    base: `http://127.0.0.1:${address.port}`,
    close: async () => { await ctx.fiber.dispose(); },
  };
}

async function json(response: Response): Promise<any> {
  return await response.json();
}

test('health lists only services that are activated', async () => {
  const server = await start();
  try {
    const response = await fetch(`${server.base}/api/health`);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.schemaVersion, '1.0');
    assert.equal(body.status, 'ok');
    assert.ok(Number.isInteger(body.uptimeMs) && body.uptimeMs >= 0);
    for (const name of ['fitnessVideo', 'fitnessExercises', 'fitnessFiles', 'fitnessHttp']) {
      assert.ok(body.services.includes(name), `health 应列出已激活服务 ${name}`);
    }
    assert.ok(!body.services.includes('fitnessUsers'), '未装载的插件不得出现在 health 中');
  } finally {
    await server.close();
  }
});

test('a registered route answers until its disposer runs', async () => {
  const server = await start();
  try {
    const dispose = server.ctx.fitnessHttp.register({
      method: 'GET',
      path: '/probe',
      handler: () => jsonResponse(200, { hit: true }),
    });
    const served = await fetch(`${server.base}/probe`);
    assert.equal(served.status, 200);
    assert.deepEqual(await json(served), { hit: true });
    dispose();
    const removed = await fetch(`${server.base}/probe`);
    assert.equal(removed.status, 404);
    assert.equal((await json(removed)).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await server.close();
  }
});

test('duplicate and overlapping route shapes are rejected', async () => {
  const server = await start();
  try {
    server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{id}', handler: () => jsonResponse(200, {}) });
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{id}', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    // 只换参数名仍是同一路径模式：两者会匹配同一批请求。
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/probe/{name}', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    assert.throws(
      () => server.ctx.fitnessHttp.register({ method: 'GET', path: '/api/health', handler: () => jsonResponse(200, {}) }),
      /路由已注册/,
    );
    // 同一路径不同方法不是重复注册。
    server.ctx.fitnessHttp.register({ method: 'POST', path: '/probe/{id}', handler: () => jsonResponse(200, {}) });
  } finally {
    await server.close();
  }
});

test('path parameters match and static segments win over parameters', async () => {
  const server = await start();
  try {
    const standard = await fetch(`${server.base}/api/exercises/squat/standard`);
    assert.equal(standard.status, 200);
    assert.equal((await json(standard)).exerciseId, 'Bodyweight_Squat');

    server.ctx.fitnessHttp.register({
      method: 'GET', path: '/probe/fixed', handler: () => jsonResponse(200, { hit: 'static' }),
    });
    server.ctx.fitnessHttp.register({
      method: 'GET', path: '/probe/{id}', handler: context => jsonResponse(200, { hit: 'param', id: context.params['id'] }),
    });
    assert.equal((await json(await fetch(`${server.base}/probe/fixed`))).hit, 'static');
    const parameter = await json(await fetch(`${server.base}/probe/other`));
    assert.equal(parameter.hit, 'param');
    assert.equal(parameter.id, 'other');
  } finally {
    await server.close();
  }
});

test('routing and body failures use the frozen error envelope', async () => {
  const server = await start({ videoRoot: process.cwd() });
  try {
    const missing = await fetch(`${server.base}/api/unknown`);
    assert.equal(missing.status, 404);
    assert.deepEqual(Object.keys(await json(missing)), ['error']);

    const wrongMethod = await fetch(`${server.base}/api/health`, { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
    const methodBody = await json(wrongMethod);
    assert.equal(methodBody.error.code, 'INVALID_ARGUMENTS');

    const badBody = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"exercise":"squat","targetRepetitions":1}',
    });
    assert.equal(badBody.status, 400);
    assert.equal((await json(badBody)).error.code, 'INVALID_ARGUMENTS');

    const badExercise = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', body: JSON.stringify({ path: 'a.mp4', exercise: 'bench', targetRepetitions: 1 }),
    });
    assert.equal(badExercise.status, 400);
    assert.equal((await json(badExercise)).error.code, 'INVALID_ARGUMENTS');

    const notJson = await fetch(`${server.base}/api/assessments`, { method: 'POST', body: 'not-json' });
    assert.equal(notJson.status, 400);
    assert.equal((await json(notJson)).error.code, 'INVALID_ARGUMENTS');
  } finally {
    await server.close();
  }
});

test('an unexpected handler failure reports INTERNAL_ERROR without internals', async () => {
  const server = await start();
  try {
    server.ctx.fitnessHttp.register({
      method: 'GET',
      path: '/probe/crash',
      handler: () => { throw new Error('secret detail from src/private/thing.ts:42'); },
    });
    const response = await fetch(`${server.base}/probe/crash`);
    assert.equal(response.status, 500);
    const body = await json(response);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, '服务内部错误');
    // 未预期异常的细节只能进服务日志，不能经响应外泄。
    const text = JSON.stringify(body);
    assert.ok(!text.includes('secret detail'));
    assert.ok(!text.includes('thing.ts'));
    assert.equal('stack' in body.error, false);
  } finally {
    await server.close();
  }
});

test('an unconfigured video root fails with 503 instead of a default directory', async () => {
  const previous = process.env.FITNESS_VIDEO_ROOT;
  delete process.env.FITNESS_VIDEO_ROOT;
  const server = await start();
  try {
    const listing = await fetch(`${server.base}/api/videos`);
    assert.equal(listing.status, 503);
    const body = await json(listing);
    assert.equal(body.error.code, 'INPUT_IO');
    assert.match(body.error.message, /FITNESS_VIDEO_ROOT/);

    const assessment = await fetch(`${server.base}/api/assessments`, {
      method: 'POST', body: JSON.stringify({ path: 'a.mp4', exercise: 'squat', targetRepetitions: 1 }),
    });
    assert.equal(assessment.status, 503);
    assert.equal((await json(assessment)).error.code, 'INPUT_IO');
  } finally {
    await server.close();
    if (previous !== undefined) process.env.FITNESS_VIDEO_ROOT = previous;
  }
});

test('video paths outside the root are rejected and listings stay relative', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitness-http-'));
  const outside = await mkdtemp(join(tmpdir(), 'fitness-outside-'));
  try {
    await writeFile(join(directory, 'squat-smoke.mp4'), 'abc');
    await writeFile(join(outside, 'secret.mp4'), 'abc');
    const server = await start({ videoRoot: directory });
    try {
      const escaped = await fetch(`${server.base}/api/assessments`, {
        method: 'POST', body: JSON.stringify({ path: '../secret.mp4', exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(escaped.status, 400);
      assert.equal((await json(escaped)).error.code, 'INVALID_ARGUMENTS');

      const absolute = await fetch(`${server.base}/api/assessments`, {
        method: 'POST', body: JSON.stringify({ path: join(outside, 'secret.mp4'), exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(absolute.status, 400);
      assert.equal((await json(absolute)).error.code, 'INVALID_ARGUMENTS');

      const listing = await json(await fetch(`${server.base}/api/videos`));
      assert.equal(listing.total, 1);
      assert.equal(listing.items[0].path, 'squat-smoke.mp4');
      assert.equal(listing.items[0].name, 'squat-smoke.mp4');
      assert.equal(listing.items[0].bytes, 3);
      assert.ok(!JSON.stringify(listing).includes(JSON.stringify(directory).slice(1, -1)), '列表不得包含本机绝对路径');
    } finally {
      await server.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('a received video returns the frozen assessment fields without local paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fitness-http-'));
  try {
    await writeFile(join(directory, 'squat-smoke.mp4'), 'abc');
    const server = await start({ videoRoot: directory });
    try {
      const response = await fetch(`${server.base}/api/assessments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'squat-smoke.mp4', exercise: 'squat', targetRepetitions: 1 }),
      });
      assert.equal(response.status, 200);
      const body = await json(response);
      assert.equal(body.schemaVersion, '1.0');
      assert.equal(body.exercise, 'squat');
      assert.match(body.sessionId, /^http-/);
      assert.deepEqual(body.video.name, 'squat-smoke.mp4');
      assert.equal(body.video.bytes, 3);
      assert.equal(typeof body.video.width, 'number');
      assert.deepEqual(Object.keys(body.model).sort(), ['id', 'sha256']);
      assert.equal(body.model.runtime, undefined);
      assert.equal(body.sampling.requestedFps, 10);
      assert.equal(body.motion.repetitions.length, 1);
      assert.deepEqual(Object.keys(body.motion.repetitions[0]).sort(), [
        'bottomMs', 'confidence', 'durationMs', 'endMs', 'maxAngle', 'minAngle',
        'rangeOfMotion', 'stability', 'startMs',
      ]);
      assert.equal(typeof body.score.total, 'number');
      assert.equal(body.score.quality.evaluatedRepetitions, 1);
      assert.ok(body.advice.items.length >= 1);
      assert.ok(!JSON.stringify(body).includes(JSON.stringify(directory).slice(1, -1)), '响应不得包含本机绝对路径');
    } finally {
      await server.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unloading the plugin destroys the listener', async () => {
  const server = await start();
  await server.close();
  await assert.rejects(fetch(`${server.base}/api/health`));
});
