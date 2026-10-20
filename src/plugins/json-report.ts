import type { Context } from 'cordis';
import type { AssessmentResult } from '../contracts.ts';

export interface JsonReportConfig {
  write?: (text: string) => void;
}

export const name = 'json-report';

export function apply(ctx: Context, config: JsonReportConfig = {}): void {
  const write = config.write ?? ((text: string) => { process.stdout.write(text); });
  ctx.on('fitness/assessment-completed', (result: AssessmentResult) => {
    write(`${JSON.stringify(result, null, 2)}\n`);
  });
}
