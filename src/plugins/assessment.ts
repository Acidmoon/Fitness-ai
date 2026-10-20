import { Service, type Context } from 'cordis';
import type { AssessmentResult, FitnessAssessment } from '../contracts.ts';

export class AssessmentPlugin extends Service implements FitnessAssessment {
  static provide = 'fitnessAssessment';
  static inject = ['fitnessInput', 'fitnessScoring', 'fitnessAdvice'];

  constructor(ctx: Context) {
    super(ctx, 'fitnessAssessment');
  }

  evaluate(value: unknown): AssessmentResult {
    const session = this.ctx.fitnessInput.parse(value);
    const score = this.ctx.fitnessScoring.score(session);
    const advice = this.ctx.fitnessAdvice.recommend(session, score);
    const result = Object.freeze({
      schemaVersion: '1.0' as const,
      sessionId: session.sessionId,
      exercise: session.exercise,
      score,
      advice,
    });
    this.ctx.emit('fitness/assessment-completed', result);
    return result;
  }
}
