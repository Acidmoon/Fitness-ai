import { copyFile, mkdir, readdir } from 'node:fs/promises';

const source = new URL('../src/data/user-database/', import.meta.url);
const destination = new URL('../dist/data/user-database/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const entry of (await readdir(source)).sort()) {
  if (!/^\d{3}-[a-z-]+\.sql$/.test(entry)) continue;
  await copyFile(new URL(entry, source), new URL(entry, destination));
}
