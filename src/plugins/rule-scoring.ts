import { Service, type Context } from 'cordis';
import {
  FitnessError, type DimensionKey, type FitnessScoring, type ScoreDimension,
  type ScoreResult, type WorkoutSession,
} from '../contracts.ts';

import type { HeuristicTechniqueStandard } from '../exercise-contracts.ts';

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dimension(key: DimensionKey, label: string, value: number, weight: number): ScoreDimension {
  return Object.freeze({ key, label, value, weight, points: round(value * weight) });
}

function labelsFor(standard: HeuristicTechniqueStandard): Readonly<Record<DimensionKey, string>> {
  if (standard.motionExercise === 'plank') {
    return { completion: '支撑时长完成度', rangeOfMotion: '姿态标准度', stability: '稳定性', tempo: '单次持续时长' };
  }
  if (standard.motionExercise === 'balance') {
    return { completion: '平衡时长完成度', rangeOfMotion: '姿态标准度', stability: '平衡稳定性', tempo: '单次持续时长' };
  }
  if (standard.motionExercise === 'sit-and-reach') {
    return { completion: '可评估次数完成度', rangeOfMotion: '前屈幅度', stability: '静态稳定性', tempo: '保持时长' };
  }
  return { completion: '可评估次数完成度', rangeOfMotion: '动作幅度', stability: '稳定性', tempo: '节奏' };
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
    const observedProgress = standard.targetUnit === 'seconds'
      ? usable.reduce((sum, rep) => sum + rep.durationMs, 0) / 1000
      : usable.length;
    const labels = labelsFor(standard);
    const dimensions = Object.freeze([
      dimension('completion', labels.completion, Math.min(observedProgress / session.targetRepetitions, 1), standard.weights.completion),
      dimension('rangeOfMotion', labels.rangeOfMotion, mean(rep => rep.rangeOfMotion), standard.weights.rangeOfMotion),
      dimension('stability', labels.stability, mean(rep => rep.stability), standard.weights.stability),
      dimension('tempo', labels.tempo, mean(rep => Math.min(rep.durationMs / standard.tempo.minMs, standard.tempo.maxMs / rep.durationMs, 1)), standard.weights.tempo),
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
