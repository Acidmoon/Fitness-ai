import { Service, type Context } from 'cordis';
import type { AdviceItem, AdviceResult, FitnessAdvice, ScoreResult, WorkoutSession } from '../contracts.ts';

const POLICY = Object.freeze({ id: 'demo-workout-advice', version: '0.1.0', kind: 'heuristic' as const });

export class RuleAdvicePlugin extends Service implements FitnessAdvice {
  static provide = 'fitnessAdvice';

  constructor(ctx: Context) {
    super(ctx, 'fitnessAdvice');
  }

  recommend(_session: WorkoutSession, score: ScoreResult): AdviceResult {
    const items: AdviceItem[] = [];
    const add = (code: string, message: string) => items.push(Object.freeze({ code, message }));
    const value = (key: string) => score.dimensions.find(item => item.key === key)?.value;

    if (score.quality.excludedRepetitions > 0) {
      add('improve-capture', `有 ${score.quality.excludedRepetitions} 次记录因置信度不足被排除；请检查遮挡、机位和光照后重新采集。`);
    }
    const completion = value('completion');
    if (completion !== undefined && completion < 1) {
      add('check-completion', '可评估次数尚未达到目标；先确认记录完整，再根据自身状态调整分组和目标。');
    }
    const range = value('rangeOfMotion');
    if (range !== undefined && range < 0.8) {
      add('improve-range', '动作幅度指标偏低；参考动作示范检查完成范围，在舒适、可控的范围内练习。');
    }
    const stability = value('stability');
    if (stability !== undefined && stability < 0.8) {
      add('improve-stability', '稳定性指标偏低；先减少连续次数，关注身体控制和动作一致性。');
    }
    const tempo = value('tempo');
    if (tempo !== undefined && tempo < 0.9) {
      add('adjust-tempo', '部分动作时长偏离本演示规则的 2–5 秒区间；可放慢过快动作并检查采集时间。');
    }
    if (!items.length) add('maintain', '本次数据满足当前演示规则；保持动作质量，并根据后续记录观察变化。');
    return Object.freeze({ policy: POLICY, items: Object.freeze(items) });
  }
}
