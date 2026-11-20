import { Service, type Context } from 'cordis';
import type { AdviceItem, AdviceResult, FitnessAdvice, ScoreResult, WorkoutSession } from '../contracts.ts';
import type { FitnessExercises, HeuristicTechniqueStandard } from '../exercise-contracts.ts';
import type { SupportedExercise } from '../vision-contracts.ts';

const POLICY = Object.freeze({ id: 'demo-workout-advice', version: '0.2.0', kind: 'heuristic' as const });

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return Number.isInteger(seconds) ? String(seconds) : String(Math.round(seconds * 10) / 10);
}

const RANGE_ADVICE: Readonly<Record<SupportedExercise, string>> = {
  squat: '动作幅度指标偏低；参考深蹲示范在舒适可控范围内适当加深屈膝角度，并保持侧面全身入镜。',
  'push-up': '动作幅度指标偏低；俯卧撑下放幅度不足，请在可控范围内增加屈肘深度。',
  crunch: '动作幅度指标偏低；卷腹时核心发力带动肩胛离开地面，避免仅靠颈部牵拉。',
  'sit-up': '动作幅度指标偏低；仰卧起坐需要较完整的躯干抬升，如力量不足可先从卷腹过渡。',
  plank: '身体直线度指标偏低；平板支撑时注意收紧核心与臀部，避免塌腰或过度抬臀。',
  'jump-rope': '跳绳起跳幅度指标偏低；保持前脚掌轻快弹性起跳，并确保全身完整入镜。',
  'sit-and-reach': '前屈幅度指标偏低；保持双膝伸直，呼气时沿腿轴匀速向前伸展，切勿强行弹振。',
  balance: '单脚站立姿态标准度偏低；保持支撑腿直立、非支撑脚清晰离地，躯干尽量保持中立竖直。',
};

const STABILITY_ADVICE: Readonly<Record<SupportedExercise, string>> = {
  squat: '稳定性指标偏低；先减少连续次数，关注下蹲过程中的躯干控制和动作一致性。',
  'push-up': '稳定性指标偏低；俯卧撑全程收紧核心，保持肩、髋、踝在一条直线上。',
  crunch: '稳定性指标偏低；控制卷腹抬起与回落节奏，减少借力晃动。',
  'sit-up': '稳定性指标偏低；匀速完成起身与回落，避免惯性甩动躯干。',
  plank: '平板支撑稳定性指标偏低；支撑过程中躯干角度波动较大，注意收紧核心并保持匀速呼吸。',
  'jump-rope': '跳绳节奏稳定性指标偏低；起跳间隔波动较大，可放慢摇绳频率以建立均匀节拍。',
  'sit-and-reach': '前屈保持阶段稳定性偏低；到达最大伸展位后请静止保持，避免反复弹振。',
  balance: '单脚站立平衡稳定性偏低；晃动幅度较大，可注视前方固定点并微收核心保持静止。',
};

export class RuleAdvicePlugin extends Service implements FitnessAdvice {
  static provide = 'fitnessAdvice';

  constructor(ctx: Context) {
    super(ctx, 'fitnessAdvice');
  }

  private resolveTechnique(exercise: string): HeuristicTechniqueStandard | undefined {
    const library = this.ctx.reflect.get('fitnessExercises', true) as FitnessExercises | undefined;
    if (!library) return undefined;
    try {
      const standard = library.getStandard(exercise);
      return standard.technique.status === 'heuristic' ? standard.technique : undefined;
    } catch {
      return undefined;
    }
  }

  recommend(session: WorkoutSession, score: ScoreResult): AdviceResult {
    const items: AdviceItem[] = [];
    const add = (code: string, message: string) => items.push(Object.freeze({ code, message }));
    const value = (key: string) => score.dimensions.find(item => item.key === key)?.value;
    const technique = this.resolveTechnique(session.exercise);
    const motionExercise = technique?.motionExercise;
    const isHold = technique?.targetUnit === 'seconds';

    if (score.quality.excludedRepetitions > 0) {
      add('improve-capture', `有 ${score.quality.excludedRepetitions} 条记录因置信度不足被排除；请检查遮挡、机位和光照后重新采集。`);
    }
    const completion = value('completion');
    if (completion !== undefined && completion < 1) {
      add('check-completion', isHold
        ? '有效保持总时长尚未达到目标秒数；先确认姿态稳定和拍摄完整，再循序渐进提升目标时长。'
        : '可评估次数尚未达到目标；先确认记录完整，再根据自身状态调整分组和目标。');
    }
    const range = value('rangeOfMotion');
    if (range !== undefined && range < 0.8) {
      add('improve-range', (motionExercise ? RANGE_ADVICE[motionExercise] : undefined)
        ?? '动作幅度指标偏低；参考动作示范检查完成范围，在舒适、可控的范围内练习。');
    }
    const stability = value('stability');
    if (stability !== undefined && stability < 0.8) {
      add('improve-stability', (motionExercise ? STABILITY_ADVICE[motionExercise] : undefined)
        ?? '稳定性指标偏低；先减少连续次数，关注身体控制和动作一致性。');
    }
    const tempo = value('tempo');
    if (tempo !== undefined && tempo < 0.9) {
      const minSec = formatSeconds(technique?.tempo.minMs ?? 2_000);
      const maxSec = formatSeconds(technique?.tempo.maxMs ?? 5_000);
      if (isHold) {
        add('adjust-tempo', `单次连续保持时长偏离本演示规则的 ${minSec}–${maxSec} 秒区间；可减少中途停顿，循序延长连续保持时间。`);
      } else if (motionExercise === 'sit-and-reach') {
        add('adjust-tempo', `前屈保持时长偏离本演示规则的 ${minSec}–${maxSec} 秒区间；建议到达前屈极值后平稳保持 ${minSec} 秒以上。`);
      } else if (motionExercise === 'jump-rope') {
        add('adjust-tempo', `单次起跳周期偏离本演示规则的 ${minSec}–${maxSec} 秒区间；可调整摇绳频率保持均匀节拍。`);
      } else {
        add('adjust-tempo', `部分动作时长偏离本演示规则的 ${minSec}–${maxSec} 秒区间；可放慢过快动作并检查采集时间。`);
      }
    }
    if (!items.length) add('maintain', '本次数据满足当前演示规则；保持动作质量，并根据后续记录观察变化。');
    return Object.freeze({ policy: POLICY, items: Object.freeze(items) });
  }
}
