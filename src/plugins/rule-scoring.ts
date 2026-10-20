import { Service, type Context } from 'cordis';
import {
  FitnessError, type DimensionKey, type FitnessScoring, type ScoreDimension,
  type ScoreResult, type WorkoutSession,
} from '../contracts.ts';

import type {} from '../exercise-contracts.ts';

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dimension(key: DimensionKey, label: string, value: number, weight: number): ScoreDimension {
  return Object.freeze({ key, label, value, weight, points: round(value * weight) });
}

export class RuleScoringPlugin extends Service implements FitnessScoring {
  static provide = 'fitnessScoring';
  static inject = ['fitnessExercises', 'fitnessInput'];

  constructor(ctx: Context) {
    super(ctx, 'fitnessScoring');
  }

  score(value: WorkoutSession): ScoreResult {
    const session = this.ctx.fitnessInput.parse(value);
    const exerciseStandard = this.ctx.fitnessExercises.getStandard(session.exercise);
    const standard = exerciseStandard.technique;
    if (standard.status !== 'heuristic') {
      throw new FitnessError('STANDARD_UNAVAILABLE', `该动作尚无可执行的质量评分标准：${session.exercise}`);
    }
    const usable = session.repetitions.filter(rep => rep.confidence >= standard.minConfidence);
    if (!usable.length) {
      throw new FitnessError('INSUFFICIENT_DATA', `没有置信度达到 ${standard.minConfidence} 的动作记录，请改善采集条件后重试`);
    }
    const mean = (select: (rep: typeof usable[number]) => number) =>
      usable.reduce((sum, rep) => sum + select(rep), 0) / usable.length;
    const dimensions = Object.freeze([
      dimension('completion', '可评估次数完成度', Math.min(usable.length / session.targetRepetitions, 1), standard.weights.completion),
      dimension('rangeOfMotion', '动作幅度', mean(rep => rep.rangeOfMotion), standard.weights.rangeOfMotion),
      dimension('stability', '稳定性', mean(rep => rep.stability), standard.weights.stability),
      dimension('tempo', '节奏', mean(rep => Math.min(rep.durationMs / standard.tempo.minMs, standard.tempo.maxMs / rep.durationMs, 1)), standard.weights.tempo),
    ]);
    return Object.freeze({
      policy: standard.policy,
      standard: Object.freeze({ exerciseId: exerciseStandard.exerciseId, sourceRevision: exerciseStandard.sourceRevision }),
      total: round(dimensions.reduce((sum, item) => sum + item.points, 0)),
      dimensions,
      quality: Object.freeze({
        observedRepetitions: session.repetitions.length,
        evaluatedRepetitions: usable.length,
        excludedRepetitions: session.repetitions.length - usable.length,
      }),
    });
  }
}
