import { readFile } from 'node:fs/promises';
import type { Context } from 'cordis';
import type { HttpRoute } from '../http-contracts.ts';

export interface WebPageConfig {
  /** Page body override; bypasses the packaged asset entirely. */
  readonly html?: string;
  /** Packaged page asset; defaults to `src/assets/index.html` next to this plugin. */
  readonly assetPath?: string | URL;
}

export const name = 'web-page';

/**
 * A route contributor, not a capability provider: the plugin registers one page
 * route on the shared HTTP entry point and exposes no service of its own.
 */
export const inject = ['fitnessHttp'];

const PAGE_PATH = '/';
const CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_ASSET = new URL('../assets/index.html', import.meta.url);

/**
 * Registers the minimal single-page front end on the shared HTTP entry point.
 * Only the public route-registration contract is consumed; the HTTP plugin
 * implementation is never imported, so the entry point keeps working without
 * this plugin and this plugin keeps working without knowing the entry point.
 */
export function apply(ctx: Context, config: WebPageConfig = {}): void {
  // The asset is read on the first request, never during startup: a missing or
  // half-deployed asset must fail that one request, not crash the whole process
  // after the server has already reported itself as listening. The cache is
  // dropped on failure so a later request can succeed once the asset appears.
  let body: Promise<string> | undefined;
  const load = (): Promise<string> => {
    const cached = body ?? (body = Promise.resolve(config.html ?? readFile(config.assetPath ?? DEFAULT_ASSET, 'utf8'))
      .catch(error => {
        body = undefined;
        throw error;
      }));
    return cached;
  };

  const route: HttpRoute = {
    method: 'GET',
    path: PAGE_PATH,
    handler: async () => ({ status: 200, headers: { 'content-type': CONTENT_TYPE }, body: await load() }),
  };
  // Unregistering on unload keeps the route from outliving the plugin.
  ctx.effect(() => ctx.fitnessHttp.register(route));
}
