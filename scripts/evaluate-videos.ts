import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { plugins } from '../src/app.ts';
import * as JsonReportPlugin from '../src/plugins/json-report.ts';
import { FitnessError } from '../src/contracts.ts';
import { createRuntime, mountPlugins } from '../src/runtime.ts';
import type { MotionAnalysis, PoseSequence, SupportedExercise } from '../src/vision-contracts.ts';

const [input, destination] = process.argv.slice(2);
if (!input || !destination || process.argv.length !== 4) {
  throw new Error('用法：node scripts/evaluate-videos.ts <视频目录> <新的结果目录>');
}
const output = resolve(destination);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // A previous run is never overwritten.
const manifest = JSON.parse(await readFile(new URL('../examples/video-test-set.json', import.meta.url), 'utf8')) as {
  file: string; exercise: SupportedExercise | null; targetRepetitions?: number;
}[];
const ctx = createRuntime();
const records: Record<string, unknown>[] = [];
try {
  await mountPlugins(ctx, plugins.filter(plugin => plugin !== JsonReportPlugin));
  const files = (await readdir(input, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')).sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    const item = manifest.find(entry => entry.file === file.name);
    const exercise = item?.exercise ?? null;
    const directory = join(output, file.name.replace(/\.mp4$/i, ''));
    const started = performance.now();
    const record: Record<string, unknown> = { file: file.name, exercise, targetRepetitions: item?.targetRepetitions ?? null };
    try {
      if (exercise) {
        const result = await ctx.fitnessVideo.assess({
          path: join(input, file.name), exercise, targetRepetitions: item?.targetRepetitions ?? 5,
          sessionId: `test-${file.name}`, sampleFps: 10, artifactDirectory: directory,
        });
        record.status = 'scored'; record.score = result.assessment.score.total;
        record.evaluatedRepetitions = result.assessment.score.quality.evaluatedRepetitions;
      } else {
        const video = await ctx.fitnessFiles.openVideo(join(input, file.name));
        const poses = await ctx.fitnessPose.estimate(video, { sampleFps: 10 });
        await ctx.fitnessArtifacts.save(directory, 'poses.json', poses);
        record.status = 'pose-only';
      }
    } catch (error) {
      record.status = 'not-scoreable';
      record.errorCode = error instanceof FitnessError ? error.code : 'RUNTIME_ERROR';
      record.error = error instanceof Error ? error.message : String(error);
    }
    try {
      const poses = JSON.parse(await readFile(join(directory, 'poses.json'), 'utf8')) as PoseSequence;
      record.frames = poses.frames.length; record.durationMs = poses.video.durationMs;
      record.width = poses.video.width; record.height = poses.video.height;
      record.rotationDegrees = poses.video.rotationDegrees;
      record.meanInferenceMs = Number((poses.performance.inferenceMs / poses.frames.length).toFixed(3));
    } catch { /* A failed decode may have no pose artifact. */ }
    if (exercise) {
      try {
        const motion = JSON.parse(await readFile(join(directory, 'motion.json'), 'utf8')) as MotionAnalysis;
        record.detectedRepetitions = motion.repetitions.length;
        record.validFrames = motion.validFrames; record.rejectedFrames = motion.rejectedFrames;
        record.side = motion.side; record.warnings = motion.warnings;
      } catch { /* Inference failure precedes motion analysis. */ }
    }
    record.wallMs = Math.round(performance.now() - started);
    records.push(record);
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
  await writeFile(join(output, 'summary.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(), sampleFps: 10,
    note: '运动类型来自人工查看；目标次数仅供示例评分。尚无逐次人工真值，不报告计数准确率。', records,
  }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
} finally {
  await ctx.fiber.dispose();
}
