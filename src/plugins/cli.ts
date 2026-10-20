import { randomUUID } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError, type FitnessCli } from '../contracts.ts';
import type { ExerciseQuery } from '../exercise-contracts.ts';
import type { SupportedExercise } from '../vision-contracts.ts';

export const HELP = [
  'Fitness AI · Cordis 插件化运动评价 MVP',
  '',
  '用法：pnpm start <运动记录.json>',
  '视频：pnpm start video <视频路径> --exercise squat|push-up --target <目标次数>',
  '选项：--sample-fps 10 --session <会话标识> --artifacts <新的输出目录>',
  '动作库：pnpm start exercises list [--query <关键词>] [--limit 50] [--offset 0]',
  '动作详情：pnpm start exercises show <动作ID或别名>',
  '评分标准：pnpm start exercises standard <动作ID或别名>',
  '目录来源：pnpm start exercises manifest',
  '目标完成度：pnpm start exercises score-goal <观测记录.json>',
  '示例：pnpm demo',
  '',
  'JSON 输入契约：schemaVersion = "1.0"；评分支持 squat 和 push-up。',
  '视频推理需配置 FITNESS_PYTHON 并安装 python/requirements.txt。',
  '成功时向标准输出写入 JSON；失败时返回非零退出码。',
  '评分与建议使用演示规则，尚未经真实运动数据标定。',
  '',
].join('\n');

function bad(message: string): never { throw new FitnessError('INVALID_ARGUMENTS', message); }

export class CliPlugin extends Service implements FitnessCli {
  static provide = 'fitnessCli';
  static inject = ['fitnessInput', 'fitnessAssessment', 'fitnessVideo', 'fitnessExercises'];

  constructor(ctx: Context) { super(ctx, 'fitnessCli'); }

  private async exercises(args: readonly string[]): Promise<void> {
    const command = args[0];
    let result: unknown;
    if (command === 'manifest' && args.length === 1) {
      result = this.ctx.fitnessExercises.manifest();
    } else if ((command === 'show' || command === 'standard') && args.length === 2) {
      result = command === 'show' ? this.ctx.fitnessExercises.get(args[1]!) : this.ctx.fitnessExercises.getStandard(args[1]!);
    } else if (command === 'score-goal' && args.length === 2) {
      result = this.ctx.fitnessExercises.scoreGoal(await this.ctx.fitnessInput.load(args[1]!));
    } else if (command === 'list') {
      const fields: Readonly<Record<string, string>> = {
        '--query': 'query', '--category': 'category', '--level': 'level', '--equipment': 'equipment',
        '--muscle': 'muscle', '--technique': 'technique', '--offset': 'offset', '--limit': 'limit',
      };
      const query: Record<string, unknown> = {};
      for (let index = 1; index < args.length; index += 2) {
        const key = args[index]!;
        const field = fields[key];
        const value = args[index + 1];
        if (!Object.hasOwn(fields, key) || !field || Object.hasOwn(query, field) || !value || value.startsWith('--')) bad(`无效、重复或缺少值的动作查询选项：${key}`);
        query[field] = field === 'offset' || field === 'limit' ? Number(value)
          : field === 'equipment' && value === 'null' ? null : value;
      }
      result = this.ctx.fitnessExercises.list(query as ExerciseQuery);
    } else {
      bad('exercises 需要 list、show <ID>、standard <ID>、manifest 或 score-goal <JSON路径>');
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }

  async run(args: readonly string[]): Promise<void> {
    if (args[0] === 'exercises') {
      await this.exercises(args.slice(1));
      return;
    }
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
      process.stdout.write(HELP);
      return;
    }
    if (args[0] === 'video') {
      const path = args[1];
      if (!path || path.startsWith('-')) bad('video 后需要提供视频文件路径');
      const options = new Map<string, string>();
      const allowed = new Set(['--exercise', '--target', '--sample-fps', '--session', '--artifacts']);
      for (let index = 2; index < args.length; index += 2) {
        const key = args[index]!;
        const value = args[index + 1];
        if (!allowed.has(key) || options.has(key) || !value || value.startsWith('--')) bad(`无效、重复或缺少值的选项：${key}`);
        options.set(key, value);
      }
      const exercise = options.get('--exercise');
      const target = Number(options.get('--target'));
      const sampleFps = Number(options.get('--sample-fps') ?? 10);
      if (exercise !== 'squat' && exercise !== 'push-up') bad('--exercise 必须是 squat 或 push-up');
      if (!Number.isInteger(target) || target < 1 || target > 10_000) bad('--target 必须是 1–10000 的整数');
      if (!Number.isFinite(sampleFps) || sampleFps < 1 || sampleFps > 30) bad('--sample-fps 必须在 1–30 之间');
      const artifactDirectory = options.get('--artifacts');
      await this.ctx.fitnessVideo.assess({
        path, exercise: exercise as SupportedExercise, targetRepetitions: target, sampleFps,
        sessionId: options.get('--session') ?? `video-${randomUUID()}`,
        ...(artifactDirectory === undefined ? {} : { artifactDirectory }),
      });
      return;
    }
    const path = args[0];
    if (args.length !== 1 || !path || path.startsWith('-')) bad('请提供一个 JSON 文件路径；使用 --help 查看用法');
    const value = await this.ctx.fitnessInput.load(path);
    this.ctx.fitnessAssessment.evaluate(value);
  }
}
