import assert from 'node:assert/strict';
import test from 'node:test';
import { FitnessError } from '../src/contracts.ts';
import { postgresOptions } from '../src/plugins/postgres.ts';
import * as validate from '../src/user-validation.ts';

const url = 'postgresql://test_user:fictional-test-secret@127.0.0.1:5432/fitness_test';
const hasCode = (code: string) => (error: unknown) => error instanceof FitnessError && error.code === code;

test('database configuration requires explicit verified TLS or loopback-only plaintext', () => {
  const verified = postgresOptions({ connectionString:url, tls:'verify-full' });
  assert.deepEqual(verified.pool.ssl,{ rejectUnauthorized:true });
  assert.equal(postgresOptions({ connectionString:url,tls:'local' }).pool.ssl,false);
  for (const invalid of [
    { connectionString:'not-a-url' },
    { connectionString:'postgresql://test_user@127.0.0.1/fitness_test' },
    { connectionString:'postgresql://test_user:fictional-test-secret@db.example.invalid/fitness_test',tls:'local' as const },
    { connectionString:url+'?sslmode=no-verify' },
    { connectionString:url+'?options=unsafe' },
    { connectionString:url,maxConnections:0 },
    { connectionString:url,transactionTimeoutMs:0 },
  ]) assert.throws(() => postgresOptions(invalid),hasCode('DATABASE_CONFIG'));
});

test('user profile and identity normalization are explicit and reject undeclared secrets', () => {
  assert.equal(validate.identity({ provider:'email',subject:' Demo@EXAMPLE.com ',verified:false }).subject,'demo@example.com');
  assert.equal(validate.identity({ provider:'oidc:example',subject:'Case-Sensitive-Subject',verified:true }).subject,'Case-Sensitive-Subject');
  assert.equal(validate.identity({ provider:'phone',subject:'+8613800000000',verified:false }).subject,'+8613800000000');
  for (const identity of [
    { provider:'email',subject:'a..b@example.com',verified:false },
    { provider:'email',subject:'a@invalid',verified:false },
    { provider:'phone',subject:'13800000000',verified:false },
    { provider:'oidc',subject:'ok',verified:'yes' },
    { provider:'oidc',subject:'\ud800',verified:true },
    { provider:'email',subject:'ok@example.com',verified:false,secret:'not-allowed' },
  ]) assert.throws(() => validate.identity(identity),hasCode('USER_INVALID'));
  assert.throws(() => validate.profile({ displayName:'a',locale:'zh-CN',timeZone:'invented',avatarAssetId:null }),hasCode('USER_INVALID'));
  assert.equal(validate.canonical({ b:2,a:1 }),validate.canonical({ a:1,b:2 }));
});
