import assert from 'node:assert/strict';
import { mkdtemp, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AppUpdatePlugin, parseAndroidReleaseManifest, type AppUpdateConfig } from '../src/plugins/app-update.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { HttpApiPlugin } from '../src/plugins/http-api.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import { makePoses } from './vision-fixtures.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;

const VALID_MANIFEST = {
  schemaVersion: '1.0',
  versionCode: 6,
  versionName: '1.4.0',
  minSupportedVersionCode: 3,
  apkUrl: 'https://download.waterhill.cyou/download/2cb797251c53b262',
  sha256: '234006E0229C5B4E4724E86085D1F1A80DA55F1611264FE9EC046C500B601A84',
  bytes: 10_798_209,
  releaseNotes: ['新增训练记录骨架动图回放', '支持应用内检查更新与校验安装'],
  publishedAt: '2026-11-20T16:00:00+08:00',
  mandatory: false,
};

class FixturePosePlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  constructor(ctx: Context) {
    super(ctx, 'fitnessPose');
  }
  async estimate(_video: VideoFile, _options?: PoseOptions): Promise<PoseSequence> {
    return makePoses();
  }
}

async function startServer(updateConfig: AppUpdateConfig = {}) {
  const ctx = createRuntime();
  await ctx.plugin(FixturePosePlugin).await();
  await mountPlugins(ctx, [
    VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin, JsonArtifactsPlugin,
    WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin,
  ]);
  const updateFork = ctx.plugin(AppUpdatePlugin, updateConfig);
  await updateFork.await();
  let address: { host: string; port: number } | undefined;
  await ctx.plugin(HttpApiPlugin, {
    port: 0,
    onListening: value => { address = value; },
  }).await();
  assert.ok(address);
  return {
    ctx,
    updateFork,
    base: `http://127.0.0.1:${address.port}`,
    close: async () => { await ctx.fiber.dispose(); },
  };
}

test('parseAndroidReleaseManifest validates strictly and enforces HTTPS apkUrl', () => {
  const parsed = parseAndroidReleaseManifest(VALID_MANIFEST);
  assert.equal(parsed.schemaVersion, '1.0');
  assert.equal(parsed.versionCode, 6);
  assert.equal(parsed.versionName, '1.4.0');
  assert.equal(parsed.minSupportedVersionCode, 3);
  assert.equal(parsed.sha256, VALID_MANIFEST.sha256.toLowerCase());
  assert.equal(parsed.publishedAt, '2026-11-20T08:00:00.000Z');
  assert.equal(parsed.mandatory, false);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.releaseNotes));

  const reject = (patch: Record<string, unknown>) => {
    assert.throws(() => parseAndroidReleaseManifest({ ...VALID_MANIFEST, ...patch }), hasCode('APP_UPDATE_INVALID'));
  };
  reject({ schemaVersion: '2.0' });
  reject({ versionCode: 0 });
  reject({ versionCode: 6.5 });
  reject({ minSupportedVersionCode: 7 }); // > versionCode
  reject({ minSupportedVersionCode: 0 });
  reject({ versionName: '   ' });
  reject({ apkUrl: 'http://download.waterhill.cyou/app.apk' }); // non-HTTPS
  reject({ apkUrl: 'file:///etc/passwd' });
  reject({ apkUrl: 'https://user:pass@download.waterhill.cyou/app.apk' });
  reject({ sha256: 'abc123' });
  reject({ bytes: 0 });
  reject({ bytes: -10 });
  reject({ releaseNotes: ['ok', '   '] });
  reject({ publishedAt: '2026-11-20' });
  reject({ mandatory: 'true' });
  reject({ extraField: 'nope' });
});

test('GET /api/app/android/latest returns 503 when unconfigured and 404 when manifest file is absent', async () => {
  const previous = process.env.FITNESS_APP_RELEASES_FILE;
  delete process.env.FITNESS_APP_RELEASES_FILE;
  const dir = await mkdtemp(join(tmpdir(), 'fitness-app-update-missing-'));
  try {
    const unconfigured = await startServer();
    try {
      const res = await fetch(`${unconfigured.base}/api/app/android/latest`);
      assert.equal(res.status, 503);
      assert.equal((await res.json() as { error: { code: string } }).error.code, 'APP_UPDATE_UNAVAILABLE');
    } finally {
      await unconfigured.close();
    }

    const missingPath = join(dir, 'does-not-exist.json');
    const missing = await startServer({ releasesFile: missingPath });
    try {
      const res = await fetch(`${missing.base}/api/app/android/latest`);
      assert.equal(res.status, 404);
      const body = await res.json() as { error: { code: string; message: string } };
      assert.equal(body.error.code, 'APP_UPDATE_NOT_FOUND');
      assert.equal(body.error.message.includes(dir), false, 'Error must not leak filesystem paths');
    } finally {
      await missing.close();
    }
  } finally {
    if (previous !== undefined) process.env.FITNESS_APP_RELEASES_FILE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/app/android/latest serves manifest, evaluates currentVersionCode, reloads on mtime change, and unregisters on unload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fitness-app-update-'));
  const manifestPath = join(dir, 'android-latest.json');
  try {
    await writeFile(manifestPath, JSON.stringify(VALID_MANIFEST), 'utf8');
    const server = await startServer({ releasesFile: manifestPath });
    try {
      // 1. Without currentVersionCode -> omits updateAvailable
      const plainRes = await fetch(`${server.base}/api/app/android/latest`);
      assert.equal(plainRes.status, 200);
      assert.equal(plainRes.headers.get('cache-control'), 'no-cache');
      const plain = await plainRes.json() as Record<string, unknown>;
      assert.equal(plain.versionCode, 6);
      assert.equal(plain.versionName, '1.4.0');
      assert.equal('updateAvailable' in plain, false);

      // 2. With currentVersionCode=5 -> updateAvailable: true
      const olderRes = await fetch(`${server.base}/api/app/android/latest?currentVersionCode=5`);
      assert.equal(olderRes.status, 200);
      assert.equal((await olderRes.json() as { updateAvailable: boolean }).updateAvailable, true);

      // 3. With currentVersionCode=6 -> updateAvailable: false
      const sameRes = await fetch(`${server.base}/api/app/android/latest?currentVersionCode=6`);
      assert.equal(sameRes.status, 200);
      assert.equal((await sameRes.json() as { updateAvailable: boolean }).updateAvailable, false);

      // 4. Malformed / unknown query params -> 400 INVALID_ARGUMENTS
      for (const qs of ['?currentVersionCode=0', '?currentVersionCode=abc', '?currentVersionCode=-1', '?foo=bar']) {
        const badRes = await fetch(`${server.base}/api/app/android/latest${qs}`);
        assert.equal(badRes.status, 400, `Expected 400 for ${qs}`);
        assert.equal((await badRes.json() as { error: { code: string } }).error.code, 'INVALID_ARGUMENTS');
      }

      // 5. Update manifest on disk + bump mtime -> automatically reloaded without restart
      const updated = { ...VALID_MANIFEST, versionCode: 7, versionName: '1.5.0', mandatory: true };
      await writeFile(manifestPath, JSON.stringify(updated), 'utf8');
      const future = new Date(Date.now() + 5_000);
      await utimes(manifestPath, future, future);

      const reloadedRes = await fetch(`${server.base}/api/app/android/latest?currentVersionCode=6`);
      assert.equal(reloadedRes.status, 200);
      const reloaded = await reloadedRes.json() as { versionCode: number; versionName: string; mandatory: boolean; updateAvailable: boolean };
      assert.equal(reloaded.versionCode, 7);
      assert.equal(reloaded.versionName, '1.5.0');
      assert.equal(reloaded.mandatory, true);
      assert.equal(reloaded.updateAvailable, true);

      // 6. Corrupted manifest on disk -> drops cache and fails cleanly with 503 APP_UPDATE_INVALID
      await writeFile(manifestPath, JSON.stringify({ ...updated, apkUrl: 'http://insecure.example/app.apk' }), 'utf8');
      const future2 = new Date(Date.now() + 10_000);
      await utimes(manifestPath, future2, future2);
      const corruptRes = await fetch(`${server.base}/api/app/android/latest`);
      assert.equal(corruptRes.status, 503);
      assert.equal((await corruptRes.json() as { error: { code: string } }).error.code, 'APP_UPDATE_INVALID');

      // 7. Deleted manifest on disk -> 404 APP_UPDATE_NOT_FOUND
      await unlink(manifestPath);
      const deletedRes = await fetch(`${server.base}/api/app/android/latest`);
      assert.equal(deletedRes.status, 404);
      assert.equal((await deletedRes.json() as { error: { code: string } }).error.code, 'APP_UPDATE_NOT_FOUND');

      // 8. Disposing AppUpdatePlugin unregisters its route cleanly
      await server.updateFork.dispose();
      const afterDispose = await fetch(`${server.base}/api/app/android/latest`);
      assert.equal(afterDispose.status, 404);
      assert.equal((await afterDispose.json() as { error: { code: string } }).error.code, 'INVALID_ARGUMENTS');
    } finally {
      await server.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
