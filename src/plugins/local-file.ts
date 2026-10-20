import { stat, realpath } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { FitnessFiles, VideoFile } from '../vision-contracts.ts';

export class LocalFilePlugin extends Service implements FitnessFiles {
  static provide = 'fitnessFiles';
  constructor(ctx: Context) { super(ctx, 'fitnessFiles'); }

  async openVideo(path: string): Promise<VideoFile> {
    if (!['.mp4', '.mov', '.m4v', '.avi', '.webm'].includes(extname(path).toLowerCase())) {
      throw new FitnessError('VIDEO_INVALID', '仅支持 mp4、mov、m4v、avi 或 webm 视频文件');
    }
    try {
      const resolved = await realpath(path);
      const info = await stat(resolved);
      if (!info.isFile() || !info.size || info.size > 1024 ** 3) {
        throw new FitnessError('VIDEO_INVALID', '视频必须是非空普通文件，且不超过 1 GiB');
      }
      return Object.freeze({ path: resolved, name: basename(resolved), bytes: info.size });
    } catch (cause) {
      if (cause instanceof FitnessError) throw cause;
      throw new FitnessError('INPUT_IO', `无法读取视频文件：${path}`, { cause });
    }
  }
}
