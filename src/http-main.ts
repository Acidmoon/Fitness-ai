import { FitnessError } from './contracts.ts';
import { HttpApiPlugin, type HttpApiConfig } from './plugins/http-api.ts';
import * as WebPagePlugin from './plugins/web-page.ts';
import { AssessmentPlugin } from './plugins/assessment.ts';
import { ExerciseLibraryPlugin } from './plugins/exercise-library.ts';
import { JointMotionPlugin } from './plugins/joint-motion.ts';
import { JsonArtifactsPlugin } from './plugins/json-artifacts.ts';
import { LocalFilePlugin } from './plugins/local-file.ts';
import { MoveNetPlugin } from './plugins/movenet.ts';
import { RuleAdvicePlugin } from './plugins/rule-advice.ts';
import { RuleScoringPlugin } from './plugins/rule-scoring.ts';
import { VideoAssessmentPlugin } from './plugins/video-assessment.ts';
import { WorkoutInputPlugin } from './plugins/workout-input.ts';
import { createRuntime, mountPlugins } from './runtime.ts';

/**
 * HTTP 运行方式的应用清单：运动分析业务插件，不含命令行入口、JSON 报告和用户数据库。
 * 业务能力全部是插件；HTTP 入口只在这里装载，避免命令行模式被端口占住。
 */
export const businessPlugins = [
  AssessmentPlugin,
  VideoAssessmentPlugin,
  RuleAdvicePlugin,
  RuleScoringPlugin,
  WorkoutInputPlugin,
  JointMotionPlugin,
  MoveNetPlugin,
  LocalFilePlugin,
  JsonArtifactsPlugin,
  ExerciseLibraryPlugin,
];

const ctx = createRuntime();
try {
  await mountPlugins(ctx, businessPlugins);
  const config: HttpApiConfig = {
    onListening: ({ host, port }) => {
      process.stdout.write(`Fitness AI HTTP 服务已启动：http://${host}:${port}\n`);
    },
  };
  await ctx.plugin(HttpApiPlugin, config).await();
  // The page is a route contributor on the entry point above, not a service provider.
  await ctx.plugin(WebPagePlugin).await();
  await new Promise<void>(resolveStop => {
    const stop = () => resolveStop();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
} catch (error) {
  const code = error instanceof FitnessError ? error.code : 'RUNTIME_ERROR';
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
} finally {
  await ctx.fiber.dispose();
}
