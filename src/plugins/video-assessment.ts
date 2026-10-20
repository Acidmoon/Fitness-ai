import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { FitnessVideo, VideoAssessmentRequest, VideoAssessmentResult } from '../vision-contracts.ts';

export class VideoAssessmentPlugin extends Service implements FitnessVideo {
  static provide = 'fitnessVideo';
  static inject = ['fitnessFiles', 'fitnessPose', 'fitnessMotion', 'fitnessAssessment', 'fitnessArtifacts'];
  constructor(ctx: Context) { super(ctx, 'fitnessVideo'); }

  async assess(request: VideoAssessmentRequest): Promise<VideoAssessmentResult> {
    if (!['squat', 'push-up'].includes(request.exercise) || !Number.isInteger(request.targetRepetitions)
      || request.targetRepetitions < 1 || request.targetRepetitions > 10_000 || !request.sessionId.trim()
      || request.sessionId.length > 128) {
      throw new FitnessError('INVALID_WORKOUT', '请指定支持的动作、有效会话标识及 1–10000 的目标次数');
    }
    const video = await this.ctx.fitnessFiles.openVideo(request.path);
    const poses = await this.ctx.fitnessPose.estimate(video, request.sampleFps === undefined ? {} : { sampleFps: request.sampleFps });
    if (request.artifactDirectory) await this.ctx.fitnessArtifacts.save(request.artifactDirectory, 'poses.json', poses);
    const motion = this.ctx.fitnessMotion.analyze(poses, request);
    if (request.artifactDirectory) await this.ctx.fitnessArtifacts.save(request.artifactDirectory, 'motion.json', motion);
    if (!motion.repetitions.length) {
      throw new FitnessError('INSUFFICIENT_DATA', '已提取骨架，但没有可用于评分的完整动作；请查看运动分析证据');
    }
    if (request.artifactDirectory) await this.ctx.fitnessArtifacts.save(request.artifactDirectory, 'workout.json', motion.workout);
    const assessment = this.ctx.fitnessAssessment.evaluate(motion.workout);
    if (request.artifactDirectory) await this.ctx.fitnessArtifacts.save(request.artifactDirectory, 'assessment.json', assessment);
    return Object.freeze({ poses, motion, assessment });
  }
}
