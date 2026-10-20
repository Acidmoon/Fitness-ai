import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { ArtifactName, FitnessArtifacts } from '../vision-contracts.ts';

const NAMES = new Set<ArtifactName>(['poses.json', 'motion.json', 'workout.json', 'assessment.json']);

export class JsonArtifactsPlugin extends Service implements FitnessArtifacts {
  static provide = 'fitnessArtifacts';
  constructor(ctx: Context) { super(ctx, 'fitnessArtifacts'); }

  async save(directory: string, name: ArtifactName, value: unknown): Promise<void> {
    if (!NAMES.has(name)) throw new FitnessError('ARTIFACT_IO', '不支持的证据文件名');
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (cause) {
      throw new FitnessError('ARTIFACT_IO', `无法保存 ${name}，请使用新的输出目录以避免覆盖现有文件`, { cause });
    }
  }
}
