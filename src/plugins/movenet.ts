import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Service, type Context } from 'cordis';
import { FitnessError, type FitnessErrorCode } from '../contracts.ts';
import { parsePoseSequence } from '../pose-validation.ts';
import type { FitnessPose, PoseOptions, PoseSequence, VideoFile } from '../vision-contracts.ts';

export interface MoveNetConfig {
  python?: string;
  pythonArgs?: readonly string[];
  modelPath?: string;
  workerPath?: string;
  timeoutMs?: number;
}
const WORKER_CODES = new Set<FitnessErrorCode>(['MODEL_UNAVAILABLE', 'VIDEO_INVALID', 'INFERENCE_FAILED']);

export class MoveNetPlugin extends Service implements FitnessPose {
  static provide = 'fitnessPose';
  private readonly config: Required<MoveNetConfig>;
  private readonly pending = new Map<ChildProcess, Promise<unknown>>();
  private closed = false;

  constructor(ctx: Context, config: MoveNetConfig = {}) {
    super(ctx, 'fitnessPose');
    this.config = {
      python: config.python ?? process.env.FITNESS_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3'),
      pythonArgs: config.pythonArgs ?? ['-X', 'utf8'],
      modelPath: config.modelPath ?? process.env.FITNESS_MOVENET_MODEL ?? fileURLToPath(new URL('../../models/movenet_lightning_fp16.tflite', import.meta.url)),
      workerPath: config.workerPath ?? fileURLToPath(new URL('../../python/movenet_worker.py', import.meta.url)),
      timeoutMs: config.timeoutMs ?? 120_000,
    };
    if (!Number.isFinite(this.config.timeoutMs) || this.config.timeoutMs <= 0) throw new Error('timeoutMs 必须是正数');
    ctx.effect(() => async () => {
      this.closed = true;
      const pending = [...this.pending.values()];
      for (const child of this.pending.keys()) child.kill();
      await Promise.allSettled(pending);
    });
  }

  async estimate(video: VideoFile, options: PoseOptions = {}): Promise<PoseSequence> {
    if (this.closed) throw new FitnessError('CANCELLED', '识别插件已卸载');
    if (this.pending.size >= 2) throw new FitnessError('INFERENCE_BUSY', '识别插件最多同时运行两个视频任务');
    const sampleFps = options.sampleFps ?? 10;
    if (!Number.isFinite(sampleFps) || sampleFps < 1 || sampleFps > 30) {
      throw new FitnessError('VIDEO_INVALID', '采样帧率必须在 1 到 30 之间');
    }
    const raw = await this.runWorker(video.path, sampleFps);
    if (this.closed) throw new FitnessError('CANCELLED', '识别插件已卸载');
    const result = parsePoseSequence(raw);
    this.ctx.emit('fitness/pose-produced', result);
    return result;
  }

  private runWorker(path: string, sampleFps: number): Promise<unknown> {
    const child = spawn(this.config.python, [
      ...this.config.pythonArgs, this.config.workerPath,
      '--model', this.config.modelPath, '--video', path, '--sample-fps', String(sampleFps),
    ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const operation = new Promise<unknown>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let bytes = 0;
      let terminated: string | undefined;
      let settled = false;
      const timer = setTimeout(() => { terminated = '视频推理超过时间预算'; child.kill(); }, this.config.timeoutMs);
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(child);
        if (error) reject(error); else resolve(value);
      };
      child.stdout!.setEncoding('utf8');
      child.stderr!.setEncoding('utf8');
      child.stdout!.on('data', (text: string) => {
        bytes += Buffer.byteLength(text);
        if (bytes > 32 * 1024 * 1024) {
          terminated = '骨架结果超过 32 MiB 输出预算'; child.kill();
        } else { stdout += text; }
      });
      child.stderr!.on('data', (text: string) => { stderr = (stderr + text).slice(-16_384); });
      child.once('error', cause => finish(new FitnessError('MODEL_UNAVAILABLE', '无法启动 Python，请设置 FITNESS_PYTHON 并安装 python/requirements.txt', { cause })));
      child.once('close', code => {
        if (this.closed) return finish(new FitnessError('CANCELLED', '插件卸载已终止视频识别'));
        if (terminated) return finish(new FitnessError('INFERENCE_FAILED', terminated));
        if (code !== 0) {
          for (const line of stderr.trim().split(/\r?\n/).reverse()) {
            try {
              const info = JSON.parse(line) as { code?: FitnessErrorCode; message?: string };
              if (info.code && WORKER_CODES.has(info.code) && typeof info.message === 'string') {
                return finish(new FitnessError(info.code, info.message));
              }
            } catch { /* Native runtime diagnostics may precede the JSON error. */ }
          }
          return finish(new FitnessError('INFERENCE_FAILED', `视频识别进程失败：${stderr.trim().slice(-2000) || code}`));
        }
        try { finish(undefined, JSON.parse(stdout) as unknown); }
        catch (cause) { finish(new FitnessError('POSE_INVALID', '视频识别进程未返回有效 JSON', { cause })); }
      });
    });
    this.pending.set(child, operation);
    return operation;
  }
}
