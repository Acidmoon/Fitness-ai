import { readFile } from 'node:fs/promises';
import { Service, type Context } from 'cordis';
import { FitnessError, type FitnessInput, type Repetition, type WorkoutSession } from '../contracts.ts';

function invalid(path: string, expectation: string): never {
  throw new FitnessError('INVALID_WORKOUT', `${path}: ${expectation}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, '必须是对象');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    invalid(path, '必须是长度不超过 128 的非空字符串');
  }
  return value;
}

function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(path, `必须是 ${min} 到 ${max} 之间的有限数值`);
  }
  return value;
}

export class WorkoutInputPlugin extends Service implements FitnessInput {
  static provide = 'fitnessInput';

  constructor(ctx: Context) {
    super(ctx, 'fitnessInput');
  }

  parse(value: unknown): WorkoutSession {
    const data = record(value, 'workout');
    if (data.schemaVersion !== '1.0') invalid('schemaVersion', '仅支持版本 "1.0"');
    const sessionId = text(data.sessionId, 'sessionId');
    const exercise = text(data.exercise, 'exercise');
    const target = number(data.targetRepetitions, 'targetRepetitions', 1, 10_000);
    if (!Number.isInteger(target)) invalid('targetRepetitions', '必须是整数');
    if (!Array.isArray(data.repetitions) || !data.repetitions.length || data.repetitions.length > 10_000) {
      invalid('repetitions', '必须包含 1 到 10000 条动作记录');
    }
    const repetitions = data.repetitions.map((value: unknown, index: number): Repetition => {
      const path = `repetitions[${index}]`;
      const rep = record(value, path);
      return Object.freeze({
        rangeOfMotion: number(rep.rangeOfMotion, `${path}.rangeOfMotion`, 0, 1),
        stability: number(rep.stability, `${path}.stability`, 0, 1),
        durationMs: number(rep.durationMs, `${path}.durationMs`, 1, 60_000),
        confidence: number(rep.confidence, `${path}.confidence`, 0, 1),
      });
    });
    return Object.freeze({
      schemaVersion: '1.0', sessionId, exercise, targetRepetitions: target,
      repetitions: Object.freeze(repetitions),
    });
  }

  async load(path: string): Promise<unknown> {
    let source: string;
    try {
      source = await readFile(path, 'utf8');
    } catch (cause) {
      throw new FitnessError('INPUT_IO', `无法读取输入文件：${path}`, { cause });
    }
    try {
      return JSON.parse(source.replace(/^\uFEFF/, '')) as unknown;
    } catch (cause) {
      throw new FitnessError('INVALID_JSON', `输入文件不是有效 JSON：${path}`, { cause });
    }
  }
}
