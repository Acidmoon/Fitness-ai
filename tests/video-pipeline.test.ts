import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import { AssessmentPlugin } from '../src/plugins/assessment.ts';
import { WorkoutInputPlugin } from '../src/plugins/workout-input.ts';
import { ExerciseLibraryPlugin } from '../src/plugins/exercise-library.ts';
import { RuleScoringPlugin } from '../src/plugins/rule-scoring.ts';
import { RuleAdvicePlugin } from '../src/plugins/rule-advice.ts';
import { LocalFilePlugin } from '../src/plugins/local-file.ts';
import { JsonArtifactsPlugin } from '../src/plugins/json-artifacts.ts';
import { JointMotionPlugin } from '../src/plugins/joint-motion.ts';
import { VideoAssessmentPlugin } from '../src/plugins/video-assessment.ts';
import type { FitnessPose, PoseSequence, VideoFile } from '../src/vision-contracts.ts';
import { CYCLE, makePoses } from './vision-fixtures.ts';

class FixturePosePlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  private readonly poses: PoseSequence;
  constructor(ctx: Context, config: { poses: PoseSequence }) {
    super(ctx, 'fitnessPose'); this.poses = config.poses;
  }
  async estimate(video: VideoFile): Promise<PoseSequence> {
    assert.equal(video.bytes, 3);
    return this.poses;
  }
}
const pipeline = [VideoAssessmentPlugin, AssessmentPlugin, LocalFilePlugin, JointMotionPlugin,
  JsonArtifactsPlugin, WorkoutInputPlugin, RuleScoringPlugin, RuleAdvicePlugin, ExerciseLibraryPlugin];

test('a received video crosses pose and motion contracts before scoring', async () => {
  const ctx = createRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'fitness-video-'));
  try {
    const path = join(directory, 'video with spaces.mp4');
    await writeFile(path, 'abc');
    await ctx.plugin(FixturePosePlugin, { poses: makePoses() });
    await mountPlugins(ctx, pipeline);
    const artifacts = join(directory, 'evidence');
    let completed = 0;
    ctx.on('fitness/assessment-completed', () => { completed++; });
    const result = await ctx.fitnessVideo.assess({
      path, exercise: 'squat', targetRepetitions: 1, sessionId: 'video-test', artifactDirectory: artifacts,
    });
    assert.equal(result.motion.repetitions.length, 1);
    assert.equal(result.assessment.score.quality.evaluatedRepetitions, 1);
    assert.equal(completed, 1);
    assert.deepEqual((await readdir(artifacts)).sort(), ['assessment.json', 'motion.json', 'poses.json', 'workout.json']);
    const workout: unknown = JSON.parse(await readFile(join(artifacts, 'workout.json'), 'utf8'));
    assert.equal(ctx.fitnessInput.parse(workout).sessionId, 'video-test');
    await assert.rejects(ctx.fitnessArtifacts.save(artifacts, 'poses.json', {}), error => error instanceof FitnessError && error.code === 'ARTIFACT_IO');
    assert.equal(JSON.parse(await readFile(join(artifacts, 'poses.json'), 'utf8')).frames.length, CYCLE.length);
    assert.equal(await readFile(path, 'utf8'), 'abc');
  } finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('no-cycle videos preserve evidence without emitting a score', async () => {
  const ctx = createRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'fitness-video-'));
  try {
    const path = join(directory, 'partial.mp4');
    await writeFile(path, 'abc');
    await ctx.plugin(FixturePosePlugin, { poses: makePoses([170, 170, 150, 100, 90]) });
    await mountPlugins(ctx, pipeline);
    const artifacts = join(directory, 'evidence');
    let completed = 0;
    ctx.on('fitness/assessment-completed', () => { completed++; });
    await assert.rejects(ctx.fitnessVideo.assess({
      path, exercise: 'squat', targetRepetitions: 1, sessionId: 'partial', artifactDirectory: artifacts,
    }), error => error instanceof FitnessError && error.code === 'INSUFFICIENT_DATA');
    assert.equal(completed, 0);
    assert.deepEqual((await readdir(artifacts)).sort(), ['motion.json', 'poses.json']);
  } finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
