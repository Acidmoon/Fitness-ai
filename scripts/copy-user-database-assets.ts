import { copyFile, mkdir } from 'node:fs/promises';

const destination=new URL('../dist/data/user-database/',import.meta.url);
await mkdir(destination,{ recursive:true });
await copyFile(new URL('../src/data/user-database/001-users.sql',import.meta.url),new URL('001-users.sql',destination));
