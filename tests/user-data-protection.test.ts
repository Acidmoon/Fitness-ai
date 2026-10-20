import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import test from 'node:test';
import { Context } from 'cordis';
import { FitnessError } from '../src/contracts.ts';
import { UserDataProtectionPlugin, type UserDataProtectionConfig } from '../src/plugins/user-data-protection.ts';

const OLD_KEY = Buffer.alloc(32, 1).toString('base64url');
const NEW_KEY = Buffer.alloc(32, 2).toString('base64url');
const LOOKUP_KEY = Buffer.alloc(32, 3).toString('base64url');
const CONFIG: UserDataProtectionConfig = { keys: { old: OLD_KEY, current: NEW_KEY }, activeKeyId: 'current', lookupKey: LOOKUP_KEY };
const CONTEXT = ['tenant-a', 'user-123', 'profile'] as const;
const ENV_KEYS = ['FITNESS_USER_ENCRYPTION_KEYS', 'FITNESS_USER_ENCRYPTION_ACTIVE_KEY', 'FITNESS_USER_LOOKUP_KEY'] as const;

function hasSafeCode(code: 'DATA_PROTECTION_CONFIG' | 'DATA_PROTECTION_FAILED') {
  return (error: unknown): boolean => {
    assert.ok(error instanceof FitnessError);
    assert.equal(error.code, code);
    assert.equal(error.message, code === 'DATA_PROTECTION_CONFIG' ? '用户数据保护配置或参数无效' : '用户数据保护操作失败');
    assert.equal(error.cause, undefined);
    return true;
  };
}

async function withoutEnvironment(action: () => Promise<void>): Promise<void> {
  const original = ENV_KEYS.map(key => process.env[key]);
  for (const key of ENV_KEYS) delete process.env[key];
  try { await action(); }
  finally {
    ENV_KEYS.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
}

async function mount(config: UserDataProtectionConfig = CONFIG) {
  const ctx = new Context();
  const fiber = await ctx.plugin(UserDataProtectionPlugin, config);
  assert.ok(fiber.committed);
  return { ctx, fiber, service: ctx.fitnessUserDataProtection };
}

function replacePart(envelope: string, index: number, replacement: string): string {
  const parts = envelope.split('.');
  parts[index] = replacement;
  return parts.join('.');
}

function flipPart(envelope: string, index: number): string {
  const bytes = Buffer.from(envelope.split('.')[index]!, 'base64url');
  bytes[0] = bytes[0]! ^ 1;
  return replacePart(envelope, index, bytes.toString('base64url'));
}

test('missing configuration has no fallback keys and configuration errors expose no input or cause', async () => {
  await withoutEnvironment(async () => {
    const ctx = new Context();
    try {
      for (const config of [undefined, {}, { keys: { current: NEW_KEY } }, { ...CONFIG, activeKeyId: undefined }, { ...CONFIG, lookupKey: undefined }]) {
        assert.throws(() => new UserDataProtectionPlugin(ctx, config as UserDataProtectionConfig), hasSafeCode('DATA_PROTECTION_CONFIG'));
      }
      process.env.FITNESS_USER_ENCRYPTION_KEYS = 'invalid JSON containing private data';
      assert.throws(() => new UserDataProtectionPlugin(ctx), hasSafeCode('DATA_PROTECTION_CONFIG'));
      for (const keys of ['null', '[]', '"private key"', '42', '{}']) {
        process.env.FITNESS_USER_ENCRYPTION_KEYS = keys;
        assert.throws(() => new UserDataProtectionPlugin(ctx), hasSafeCode('DATA_PROTECTION_CONFIG'));
      }
    } finally { await ctx.fiber.dispose(); }
  });
});

test('keyring rejects invalid IDs, noncanonical keys, absent active keys and shared lookup keys', async () => {
  await withoutEnvironment(async () => {
    const ctx = new Context();
    const invalidKeys = ['', `${NEW_KEY}=`, `${NEW_KEY}\n`, NEW_KEY.replace(/-/g, '+') + '/',
      Buffer.alloc(31).toString('base64url'), Buffer.alloc(33).toString('base64url'), `${OLD_KEY.slice(0, -1)}F`, 123, null];
    const invalidConfigs: unknown[] = [null, [], { ...CONFIG, keys: null }, { ...CONFIG, keys: [] }, { ...CONFIG, keys: {} },
      { ...CONFIG, activeKeyId: 'missing' }, { ...CONFIG, activeKeyId: 'constructor' }, { ...CONFIG, activeKeyId: null },
      { ...CONFIG, lookupKey: OLD_KEY }, { ...CONFIG, lookupKey: NEW_KEY },
      { ...CONFIG, lookupKey: `${LOOKUP_KEY}=` }, { ...CONFIG, lookupKey: Buffer.alloc(31).toString('base64url') },
      { get keys() { throw new Error('private data from configuration getter'); } }];
    for (const id of ['', 'x'.repeat(33), 'bad.id', 'bad key', 'bad\n', '密钥']) invalidConfigs.push({ ...CONFIG, keys: { [id]: NEW_KEY }, activeKeyId: id });
    for (const key of invalidKeys) invalidConfigs.push({ ...CONFIG, keys: { current: key } });
    try {
      for (const config of invalidConfigs) {
        assert.throws(() => new UserDataProtectionPlugin(ctx, config as UserDataProtectionConfig), hasSafeCode('DATA_PROTECTION_CONFIG'));
      }
    } finally { await ctx.fiber.dispose(); }
  });
});

test('environment configuration works and explicit configuration takes precedence for each field', async () => {
  await withoutEnvironment(async () => {
    process.env.FITNESS_USER_ENCRYPTION_KEYS = JSON.stringify({ env: OLD_KEY });
    process.env.FITNESS_USER_ENCRYPTION_ACTIVE_KEY = 'env';
    process.env.FITNESS_USER_LOOKUP_KEY = LOOKUP_KEY;
    const fromEnv = await mount({});
    const explicit = await mount(CONFIG);
    const partial = await mount({ keys: { env: NEW_KEY } });
    try {
      const envelope = fromEnv.service.seal(CONTEXT, '来自环境');
      assert.equal(envelope.split('.')[1], 'env');
      assert.equal(fromEnv.service.open(CONTEXT, envelope), '来自环境');
      assert.equal(explicit.service.seal(CONTEXT, 'explicit').split('.')[1], 'current');
      const partialEnvelope = partial.service.seal(CONTEXT, 'partial');
      assert.equal(partialEnvelope.split('.')[1], 'env');
      assert.throws(() => fromEnv.service.open(CONTEXT, partialEnvelope), hasSafeCode('DATA_PROTECTION_FAILED'));
      assert.equal(explicit.service.fingerprint(['tenant-a', 'oidc'], 'subject'), fromEnv.service.fingerprint(['tenant-a', 'oidc'], 'subject'));
    } finally { await Promise.all([fromEnv.ctx.fiber.dispose(), explicit.ctx.fiber.dispose(), partial.ctx.fiber.dispose()]); }
  });
});

test('key IDs support their full allowed alphabet and length without prototype lookup', async () => {
  for (const id of ['A', '_kid-9', 'x'.repeat(32), '__proto__', 'constructor']) {
    const { ctx, service } = await mount({ ...CONFIG, keys: Object.fromEntries([[id, NEW_KEY]]), activeKeyId: id });
    try {
      const envelope = service.seal(CONTEXT, 'value');
      assert.equal(envelope.split('.')[1], id);
      assert.equal(service.open(CONTEXT, envelope), 'value');
    } finally { await ctx.fiber.dispose(); }
  }
});

test('AES-256-GCM uses fresh 12-byte IVs, 16-byte tags and the specified AAD', async () => {
  const { ctx, service } = await mount();
  const plaintext = JSON.stringify({ displayName: '用户 🏃', nullable: null });
  try {
    const envelopes = Array.from({ length: 32 }, () => service.seal(CONTEXT, plaintext));
    assert.equal(new Set(envelopes.map(value => value.split('.')[2])).size, envelopes.length);
    for (const envelope of envelopes) {
      const parts = envelope.split('.');
      assert.equal(parts.length, 5);
      assert.equal(parts[0], 'v1');
      assert.equal(parts[1], 'current');
      assert.equal(Buffer.from(parts[2]!, 'base64url').length, 12);
      assert.equal(Buffer.from(parts[4]!, 'base64url').length, 16);
      assert.ok(parts.slice(2).every(part => /^[A-Za-z0-9_-]*$/.test(part)));
      assert.ok(!envelope.includes(plaintext));
      assert.equal(service.open(CONTEXT, envelope), plaintext);
    }
    const [, , iv, ciphertext, tag] = envelopes[0]!.split('.');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(NEW_KEY, 'base64url'), Buffer.from(iv!, 'base64url'));
    decipher.setAAD(Buffer.from(JSON.stringify(['fitness-users-v1', ...CONTEXT])));
    decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
    assert.equal(Buffer.concat([decipher.update(Buffer.from(ciphertext!, 'base64url')), decipher.final()]).toString('utf8'), plaintext);
  } finally { await ctx.fiber.dispose(); }
});

test('context authenticates tenant, user, field, order and component boundaries', async () => {
  const { ctx, service } = await mount();
  try {
    const envelope = service.seal(CONTEXT, 'private profile');
    for (const context of [['tenant-b', 'user-123', 'profile'], ['tenant-a', 'user-456', 'profile'],
      ['tenant-a', 'user-123', 'email'], ['user-123', 'tenant-a', 'profile'], ['tenant-a', 'user-123'],
      ['tenant-a', 'user-123', 'profile', 'extra']]) {
      assert.throws(() => service.open(context, envelope), hasSafeCode('DATA_PROTECTION_FAILED'));
    }
    assert.throws(() => service.open(['a', 'bc'], service.seal(['ab', 'c'], 'value')), hasSafeCode('DATA_PROTECTION_FAILED'));
    assert.throws(() => service.open(['a,b', 'c'], service.seal(['a', 'b,c'], 'value')), hasSafeCode('DATA_PROTECTION_FAILED'));
    const contextWithToJSON = Object.assign([...CONTEXT], { toJSON: () => ['forged'] });
    assert.equal(service.open(CONTEXT, service.seal(contextWithToJSON, 'value')), 'value');
    assert.equal(service.fingerprint(CONTEXT, 'value'), service.fingerprint(contextWithToJSON, 'value'));
  } finally { await ctx.fiber.dispose(); }
});

test('tampering with IV, ciphertext, tag or key ID never exposes unauthenticated plaintext', async () => {
  const { ctx, service } = await mount();
  try {
    const envelope = service.seal(CONTEXT, 'private plaintext with a secret');
    for (const changed of [flipPart(envelope, 2), flipPart(envelope, 3), flipPart(envelope, 4), replacePart(envelope, 1, 'old'), replacePart(envelope, 1, 'unknown')]) {
      assert.throws(() => service.open(CONTEXT, changed), hasSafeCode('DATA_PROTECTION_FAILED'));
    }
  } finally { await ctx.fiber.dispose(); }
});

test('malformed, oversized and noncanonical envelopes are rejected by open and needsRotation', async () => {
  const { ctx, service } = await mount();
  try {
    const envelope = service.seal(CONTEXT, 'private');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const tag = envelope.split('.')[4]!;
    const noncanonicalTag = tag.slice(0, -1) + alphabet[alphabet.indexOf(tag.at(-1)!) + 1];
    const invalid = ['', 'v1', envelope + '.extra', replacePart(envelope, 0, 'v2'), replacePart(envelope, 1, ''),
      replacePart(envelope, 1, 'bad.id'), replacePart(envelope, 1, 'unknown'), replacePart(envelope, 2, ''),
      replacePart(envelope, 2, Buffer.alloc(11).toString('base64url')), replacePart(envelope, 2, envelope.split('.')[2]! + '='),
      replacePart(envelope, 3, 'abc='), replacePart(envelope, 3, '+abc'), replacePart(envelope, 3, 'A'),
      replacePart(envelope, 3, Buffer.alloc(65_537).toString('base64url')), replacePart(envelope, 4, ''),
      replacePart(envelope, 4, noncanonicalTag), replacePart(envelope, 4, Buffer.alloc(15).toString('base64url')), 'x'.repeat(100_000)];
    for (const value of invalid) {
      assert.throws(() => service.open(CONTEXT, value), hasSafeCode('DATA_PROTECTION_FAILED'));
      assert.throws(() => service.needsRotation(value), hasSafeCode('DATA_PROTECTION_FAILED'));
    }
    for (const value of [null, undefined, {}, 42]) {
      assert.throws(() => service.open(CONTEXT, value as string), hasSafeCode('DATA_PROTECTION_CONFIG'));
      assert.throws(() => service.needsRotation(value as string), hasSafeCode('DATA_PROTECTION_CONFIG'));
    }
  } finally { await ctx.fiber.dispose(); }
});

test('empty and exactly 64 KiB UTF-8 plaintext work while excessive bytes and invalid arguments fail', async () => {
  const { ctx, service } = await mount();
  try {
    for (const plaintext of ['', 'a'.repeat(65_536), '界'.repeat(21_845) + 'a', '🏃'.repeat(16_384)]) {
      const envelope = service.seal(CONTEXT, plaintext);
      assert.equal(service.open(CONTEXT, envelope), plaintext);
      assert.match(service.fingerprint(CONTEXT, plaintext), /^[0-9a-f]{64}$/);
    }
    const empty = service.seal(CONTEXT, '');
    assert.equal(empty.split('.')[3], '');
    const invalidPlaintexts: unknown[] = ['a'.repeat(65_537), '界'.repeat(21_846), '🏃'.repeat(16_385), null, undefined, 123, {}];
    for (const plaintext of invalidPlaintexts) {
      assert.throws(() => service.seal(CONTEXT, plaintext as string), hasSafeCode('DATA_PROTECTION_CONFIG'));
      assert.throws(() => service.fingerprint(CONTEXT, plaintext as string), hasSafeCode('DATA_PROTECTION_CONFIG'));
    }
    const invalidContexts: unknown[] = [null, undefined, 'tenant-a', [], Array(9).fill('part'), [''], ['x'.repeat(257)], [42], [null], Array(1)];
    for (let character = 0; character < 32; character++) invalidContexts.push([`tenant${String.fromCharCode(character)}`]);
    for (const context of invalidContexts) {
      assert.throws(() => service.seal(context as string[], 'private'), hasSafeCode('DATA_PROTECTION_CONFIG'));
      assert.throws(() => service.open(context as string[], empty), hasSafeCode('DATA_PROTECTION_CONFIG'));
      assert.throws(() => service.fingerprint(context as string[], 'private'), hasSafeCode('DATA_PROTECTION_CONFIG'));
    }
    for (const context of [['x'.repeat(256)], Array(8).fill('part'), ['\u007f'], ['tenant', 'quote"slash\\comma,']]) {
      assert.equal(service.open(context, service.seal(context, 'ok')), 'ok');
    }
  } finally { await ctx.fiber.dispose(); }
});

test('plaintext rejects lone surrogates and preserves valid supplementary Unicode', async () => {
  const { ctx, service } = await mount();
  try {
    for (const value of ['\ud800', '\ud801', '\udc00', 'before\ud800after']) {
      assert.throws(() => service.seal(CONTEXT, value), hasSafeCode('DATA_PROTECTION_CONFIG'));
      assert.throws(() => service.fingerprint(CONTEXT, value), hasSafeCode('DATA_PROTECTION_CONFIG'));
    }
    const value = '训练😀';
    assert.equal(service.open(CONTEXT, service.seal(CONTEXT, value)), value);
  } finally { await ctx.fiber.dispose(); }
});

test('a new active key writes new envelopes and reads old ciphertext retained in the keyring', async () => {
  const old = await mount({ keys: { old: OLD_KEY }, activeKeyId: 'old', lookupKey: LOOKUP_KEY });
  const rotated = await mount();
  const currentOnly = await mount({ keys: { current: NEW_KEY }, activeKeyId: 'current', lookupKey: LOOKUP_KEY });
  try {
    const oldEnvelope = old.service.seal(CONTEXT, 'old record');
    const newEnvelope = rotated.service.seal(CONTEXT, 'new record');
    assert.equal(old.service.needsRotation(oldEnvelope), false);
    assert.equal(rotated.service.needsRotation(oldEnvelope), true);
    assert.equal(rotated.service.needsRotation(newEnvelope), false);
    assert.equal(rotated.service.open(CONTEXT, oldEnvelope), 'old record');
    assert.equal(currentOnly.service.open(CONTEXT, newEnvelope), 'new record');
    const rewritten = rotated.service.seal(CONTEXT, rotated.service.open(CONTEXT, oldEnvelope));
    assert.equal(rewritten.split('.')[1], 'current');
    assert.equal(rotated.service.needsRotation(rewritten), false);
    assert.equal(currentOnly.service.open(CONTEXT, rewritten), 'old record');
    assert.throws(() => currentOnly.service.open(CONTEXT, oldEnvelope), hasSafeCode('DATA_PROTECTION_FAILED'));
    assert.throws(() => old.service.open(CONTEXT, newEnvelope), hasSafeCode('DATA_PROTECTION_FAILED'));
    assert.equal(old.service.fingerprint(['tenant-a', 'oidc'], 'external-id'), rotated.service.fingerprint(['tenant-a', 'oidc'], 'external-id'));
  } finally { await Promise.all([old.ctx.fiber.dispose(), rotated.ctx.fiber.dispose(), currentOnly.ctx.fiber.dispose()]); }
});

test('lookup fingerprints are stable and separate tenants, providers, values and component lengths', async () => {
  const first = await mount();
  const second = await mount({ ...CONFIG, lookupKey: Buffer.alloc(32, 4).toString('base64url') });
  try {
    const value = first.service.fingerprint(['tenant-a', 'oidc'], 'subject-123');
    assert.match(value, /^[0-9a-f]{64}$/);
    assert.equal(value, first.service.fingerprint(['tenant-a', 'oidc'], 'subject-123'));
    for (const [context, plaintext] of [[['tenant-b', 'oidc'], 'subject-123'], [['tenant-a', 'github'], 'subject-123'],
      [['tenant-a', 'oidc'], 'subject-124'], [['oidc', 'tenant-a'], 'subject-123']] as const) {
      assert.notEqual(value, first.service.fingerprint(context, plaintext));
    }
    assert.notEqual(value, second.service.fingerprint(['tenant-a', 'oidc'], 'subject-123'));
    assert.notEqual(first.service.fingerprint(['ab', 'c'], 'd'), first.service.fingerprint(['a', 'bc'], 'd'));
    assert.notEqual(first.service.fingerprint(['a'], 'bc'), first.service.fingerprint(['ab'], 'c'));
    assert.notEqual(first.service.fingerprint(['a'], 'b,c'), first.service.fingerprint(['a', 'b'], 'c'));
    assert.notEqual(first.service.fingerprint(['a', 'b,c'], 'd'), first.service.fingerprint(['a,b', 'c'], 'd'));
  } finally { await Promise.all([first.ctx.fiber.dispose(), second.ctx.fiber.dispose()]); }
});

test('unloading clears every key buffer and retained service references reject all methods', async t => {
  const decodedKeys: Buffer[] = [];
  const originalFrom = Buffer.from;
  const restore = t.mock.method(Buffer, 'from', (...args: unknown[]) => {
    const buffer: Buffer = Reflect.apply(originalFrom, Buffer, args);
    if (args[1] === 'base64url' && [OLD_KEY, NEW_KEY, LOOKUP_KEY].includes(args[0] as string)) decodedKeys.push(buffer);
    return buffer;
  });
  const { ctx, fiber, service } = await mount();
  restore.mock.restore();
  try {
    assert.equal(decodedKeys.length, 3);
    assert.ok(decodedKeys.every(buffer => buffer.some(byte => byte !== 0)));
    const envelope = service.seal(CONTEXT, 'private');
    await fiber.dispose();
    assert.equal(ctx.fitnessUserDataProtection, undefined);
    assert.ok(decodedKeys.every(buffer => buffer.every(byte => byte === 0)));
    for (const operation of [() => service.seal(CONTEXT, 'private'), () => service.open(CONTEXT, envelope),
      () => service.fingerprint(CONTEXT, 'private'), () => service.needsRotation(envelope), () => service.needsRotation('invalid')]) {
      assert.throws(operation, hasSafeCode('DATA_PROTECTION_FAILED'));
    }
    const replacement = await ctx.plugin(UserDataProtectionPlugin, CONFIG);
    assert.ok(replacement.committed);
    assert.equal((ctx as Context).fitnessUserDataProtection.open(CONTEXT, envelope), 'private');
    assert.throws(() => service.seal(CONTEXT, 'private'), hasSafeCode('DATA_PROTECTION_FAILED'));
  } finally { await ctx.fiber.dispose(); }
});

test('configuration failures zeroize keys that were decoded before validation failed', async t => {
  const ctx = new Context();
  const decodedKeys: Buffer[] = [];
  const originalFrom = Buffer.from;
  const restore = t.mock.method(Buffer, 'from', (...args: unknown[]) => {
    const buffer: Buffer = Reflect.apply(originalFrom, Buffer, args);
    if (args[1] === 'base64url') decodedKeys.push(buffer);
    return buffer;
  });
  try {
    assert.throws(() => new UserDataProtectionPlugin(ctx, { ...CONFIG, lookupKey: OLD_KEY }), hasSafeCode('DATA_PROTECTION_CONFIG'));
    restore.mock.restore();
    assert.equal(decodedKeys.length, 3);
    assert.ok(decodedKeys.every(buffer => buffer.every(byte => byte === 0)));
  } finally { restore.mock.restore(); await ctx.fiber.dispose(); }
});
