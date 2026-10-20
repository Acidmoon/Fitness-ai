import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { open, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = fileURLToPath(new URL('..', import.meta.url));
const binaryDirectory = process.env.FITNESS_TEST_PG_BIN;
if (!binaryDirectory) throw new Error('Set FITNESS_TEST_PG_BIN to an installed PostgreSQL 16+ bin directory. This command never uses an existing server.');
const binary = (name: string) => join(resolve(binaryDirectory), `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const artifactsRoot = resolve(root,'artifacts');
const directory = join(artifactsRoot,`user-database-test-${Date.now()}-${randomUUID().slice(0,8)}`);
if (!directory.startsWith(artifactsRoot + sep)) throw new Error('Unexpected test directory');
await mkdir(directory,{ recursive:true });
const log = await open(join(directory,'postgres.log'),'wx');
const credential = randomBytes(32).toString('hex');
const credentialFile = join(directory,'initial-credential.tmp');
await writeFile(credentialFile,credential,{ encoding:'utf8', flag:'wx', mode:0o600 });
const environment = { ...process.env, LC_ALL:'C', PGPASSWORD:credential };
function wait(child: ChildProcess): Promise<number> {
  return new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',code => { resolve(code ?? 1); }); });
}
async function command(executable: string,args: readonly string[]): Promise<void> {
  const code = await wait(spawn(executable,[...args],{ cwd:root, env:environment, windowsHide:true, stdio:['ignore',log.fd,log.fd] }));
  if (code) throw new Error(`PostgreSQL test setup failed; inspect ${join(directory,'postgres.log')}`);
}
const listener = createServer();
await new Promise<void>((resolve,reject) => { listener.once('error',reject); listener.listen(0,'127.0.0.1',() => { resolve(); }); });
const address = listener.address();
if (!address || typeof address === 'string') throw new Error('Cannot reserve a test port');
const port = address.port;
await new Promise<void>(resolve => listener.close(() => { resolve(); }));
let server: ChildProcess | undefined;
let stop: Promise<void> | undefined;
async function cleanup(): Promise<void> {
  if (stop) return stop;
  stop = (async () => {
    if (server && server.exitCode === null) await command(binary('pg_ctl'),['stop','-D',join(directory,'cluster'),'-m','fast','-w','-t','15']);
    await log.close();
  })();
  return stop;
}
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => { void cleanup().finally(() => { process.exit(1); }); });
try {
  await command(binary('initdb'),['-D',join(directory,'cluster'),'-U','fitness_test_admin',`--pwfile=${credentialFile}`,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--locale=C','--encoding=UTF8','--no-instructions']);
  if (resolve(credentialFile) !== join(directory,'initial-credential.tmp')) throw new Error('Unexpected credential file');
  await unlink(credentialFile);
  server = spawn(binary('postgres'),['-D',join(directory,'cluster'),'-h','127.0.0.1','-p',String(port)],{ cwd:root, env:environment, windowsHide:true, stdio:['ignore',log.fd,log.fd] });
  server.on('error',() => {});
  let connected: Client | undefined;
  for (let attempt=0;attempt<50;attempt++) {
    const candidate = new Client({ host:'127.0.0.1',port,user:'fitness_test_admin',password:credential,database:'postgres',ssl:false,connectionTimeoutMillis:500 });
    try { await candidate.connect(); connected=candidate; break; }
    catch { await candidate.end().catch(() => {}); await delay(100); }
  }
  if (!connected) throw new Error(`Temporary PostgreSQL did not become ready; inspect ${join(directory,'postgres.log')}`);
  const runtimeCredential = randomBytes(32).toString('hex');
  try {
    await connected.query('CREATE DATABASE fitness_users_test');
    // These values are generated hex, never user-provided identifiers or SQL fragments.
    await connected.query(`CREATE ROLE fitness_users_runtime LOGIN PASSWORD '${runtimeCredential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  } finally { await connected.end(); }
  const databaseUrl = (user: string,secret: string) => `postgresql://${user}:${secret}@127.0.0.1:${port}/fitness_users_test`;
  process.stdout.write(`Temporary PostgreSQL ready; artifacts: ${directory}\n`);
  const code = await wait(spawn(process.execPath,['--test','--test-concurrency=1','tests/integration/user-database.test.ts'],{
    cwd:root,windowsHide:true,stdio:'inherit',env:{ ...process.env,
      FITNESS_TEST_ADMIN_DATABASE_URL:databaseUrl('fitness_test_admin',credential),
      FITNESS_TEST_DATABASE_URL:databaseUrl('fitness_users_runtime',runtimeCredential),
      FITNESS_TEST_PG_BIN:resolve(binaryDirectory), FITNESS_TEST_ARTIFACTS:directory,
    },
  }));
  process.exitCode=code;
} finally { await cleanup(); }
