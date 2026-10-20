import { plugins } from './app.ts';
import { FitnessError } from './contracts.ts';
import { createRuntime, mountPlugins } from './runtime.ts';

const ctx = createRuntime();
try {
  await mountPlugins(ctx, plugins);
  await ctx.fitnessCli.run(process.argv.slice(2));
} catch (error) {
  const code = error instanceof FitnessError ? error.code : 'RUNTIME_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
} finally {
  await ctx.fiber.dispose();
}
