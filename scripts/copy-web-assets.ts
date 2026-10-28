import { copyFile, mkdir } from 'node:fs/promises';

const directory = new URL('../dist/assets/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(new URL('../src/assets/index.html', import.meta.url), new URL('index.html', directory));
