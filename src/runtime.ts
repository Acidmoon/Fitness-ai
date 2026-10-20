import { Context, type Fiber, type Plugin } from 'cordis';

export function createRuntime(): Context {
  return new Context();
}

/** Mount the complete set before awaiting dependency-triggered transitions. */
export async function mountPlugins(ctx: Context, plugins: readonly Plugin[]): Promise<Fiber[]> {
  const fibers = plugins.map(plugin => ctx.plugin(plugin));
  // Fiber.await() settles the current transition; a PENDING fiber does not wait for dependencies.
  do {
    await Promise.all(fibers.map(fiber => fiber.await()));
  } while (fibers.some(fiber => fiber.inertia));

  const pending = fibers.filter(fiber => !fiber.committed);
  if (pending.length) {
    const names = pending.map(fiber => fiber.name).join(', ');
    throw new Error(`插件未激活，请检查服务依赖：${names}`);
  }
  return fibers;
}
