import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import type { FitnessHttp, HttpRequest, HttpResponse, HttpRoute } from '../src/http-contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import * as WebPagePlugin from '../src/plugins/web-page.ts';

class FakeHttpPlugin extends Service implements FitnessHttp {
  static provide = 'fitnessHttp';
  readonly routes: HttpRoute[] = [];
  constructor(ctx: Context) {
    super(ctx, 'fitnessHttp');
  }
  register(route: HttpRoute): () => void {
    this.routes.push(route);
    return () => {
      const index = this.routes.indexOf(route);
      if (index >= 0) this.routes.splice(index, 1);
    };
  }
}

/** The contract type hides the fake's route list; reach it through the instance. */
function routes(ctx: Context): readonly HttpRoute[] {
  return (ctx.fitnessHttp as unknown as FakeHttpPlugin).routes;
}

const request: HttpRequest = {
  method: 'GET',
  path: '/',
  url: new URL('http://127.0.0.1:8787/'),
  params: {},
  query: new URLSearchParams(),
  headers: {},
  body: '',
};

test('the page plugin registers GET / and serves the single page', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, [FakeHttpPlugin, WebPagePlugin]);
    assert.equal(routes(ctx).length, 1);
    const route = routes(ctx)[0]!;
    assert.equal(route.method, 'GET');
    assert.equal(route.path, '/');
    const response: HttpResponse = await route.handler(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers?.['content-type'], 'text/html; charset=utf-8');
    const body = String(response.body);
    assert.match(body, /<!doctype html>/i);
    // Form, result region and error region must all be present.
    assert.match(body, /data-region="form"/);
    assert.match(body, /data-region="result"/);
    assert.match(body, /data-region="error"/);
    // The page must not compute its own total from the dimension values.
    assert.doesNotMatch(body, /points\s*\)\s*\.reduce|reduce\([^)]*\bpoints\b/);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('unloading the page plugin unregisters its route', async () => {
  const ctx = createRuntime();
  try {
    const fibers = await mountPlugins(ctx, [FakeHttpPlugin, WebPagePlugin]);
    assert.equal(routes(ctx).length, 1);
    await fibers[1]!.dispose();
    assert.equal(routes(ctx).length, 0);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('the served page names every backend endpoint it calls', async () => {
  const ctx = createRuntime();
  try {
    await mountPlugins(ctx, [FakeHttpPlugin, WebPagePlugin]);
    const response = await routes(ctx)[0]!.handler(request);
    const body = String(response.body);
    assert.match(body, /\/api\/videos/);
    assert.match(body, /\/api\/assessments/);
    // The page must state that results come from uncalibrated demo rules.
    assert.match(body, /未标定的演示规则/);
    assert.match(body, /不代表识别准确率/);
    // The plural route is the frozen contract; the singular draft must not reappear.
    assert.doesNotMatch(body, /\/api\/assess(?!ments)/);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('a missing page asset fails the request instead of crashing startup', async () => {
  const ctx = createRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'fitness-web-asset-'));
  const assetPath = join(directory, 'index.html');
  try {
    // Loading must not read the asset: a missing file may not reach the process
    // as an unhandled rejection after the entry point already reported readiness.
    await mountPlugins(ctx, [FakeHttpPlugin]);
    const fibers = await ctx.plugin(WebPagePlugin, { assetPath });
    assert.equal(routes(ctx).length, 1);
    const route = routes(ctx)[0]!;

    await assert.rejects(Promise.resolve(route.handler(request)), (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'ENOENT');
    // A failed load is not cached: the request fails again rather than resolving
    // to a stale rejection, which keeps the failure explainable per request.
    await assert.rejects(Promise.resolve(route.handler(request)), (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'ENOENT');

    // Once the asset exists, the same plugin recovers without a restart.
    await writeFile(assetPath, '<!doctype html><title>recovered</title>', 'utf8');
    const response = await route.handler(request);
    assert.equal(response.status, 200);
    assert.match(String(response.body), /recovered/);
    await fibers.dispose();
  } finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
