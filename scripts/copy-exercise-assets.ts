import { copyFile, mkdir } from 'node:fs/promises';

const source = new URL('../src/data/free-exercise-db/', import.meta.url);
const destination = new URL('../dist/data/free-exercise-db/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ['exercises.json', 'manifest.json', 'LICENSE.md', 'upstream-schema.json']) {
  await copyFile(new URL(name, source), new URL(name, destination));
}
