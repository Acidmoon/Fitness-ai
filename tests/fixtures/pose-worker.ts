import { makePoses } from '../vision-fixtures.ts';

const video = process.argv[process.argv.indexOf('--video') + 1];
if (video === 'slow') {
  setInterval(() => {}, 1000);
} else if (video === 'malformed') {
  process.stdout.write('not-json');
} else if (video === 'failed') {
  process.stderr.write('native diagnostic\n');
  process.stderr.write(`${JSON.stringify({ code: 'VIDEO_INVALID', message: 'fixture decode failure' })}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify(makePoses()));
}
