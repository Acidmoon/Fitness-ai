import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Service, type Context } from 'cordis';
import { FitnessError } from '../contracts.ts';
import type { FitnessUserDataProtection } from '../database-contracts.ts';

export interface UserDataProtectionConfig {
  keys?: Readonly<Record<string, string>>;
  activeKeyId?: string;
  lookupKey?: string;
}

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_LENGTH = 2 + 32 + 16 + Math.ceil(MAX_PLAINTEXT_BYTES * 4 / 3) + 22 + 4;
const configError = () => new FitnessError('DATA_PROTECTION_CONFIG', '用户数据保护配置或参数无效');
const protectionError = () => new FitnessError('DATA_PROTECTION_FAILED', '用户数据保护操作失败');

function decodeKey(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length !== 43 || !BASE64URL.test(value)) throw configError();
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== value) {
    key.fill(0);
    throw configError();
  }
  return key;
}

function validateContext(value: readonly string[]): string[] {
  try {
    if (!Array.isArray(value)) throw configError();
    const length = value.length;
    if (!Number.isInteger(length) || length < 1 || length > 8) throw configError();
    const result: string[] = [];
    for (let index = 0; index < length; index++) {
      const part: unknown = value[index];
      if (typeof part !== 'string' || part.length < 1 || part.length > 256 || /[\u0000-\u001f]/.test(part)) throw configError();
      result.push(part);
    }
    return result;
  } catch {
    throw configError();
  }
}

function validatePlaintext(value: string): void {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_PLAINTEXT_BYTES ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) throw configError();
}

function parseEnvelope(value: string): { keyId: string; iv: Buffer; ciphertext: Buffer; tag: Buffer } {
  if (typeof value !== 'string') throw configError();
  try {
    if (value.length > MAX_ENVELOPE_LENGTH) throw protectionError();
    const parts = value.split('.');
    const [version, keyId, iv, ciphertext, tag] = parts;
    if (parts.length !== 5 || version !== 'v1' || !keyId || !KEY_ID.test(keyId) ||
      iv === undefined || ciphertext === undefined || tag === undefined) throw protectionError();
    const decode = (part: string, length: number | undefined): Buffer => {
      if (!BASE64URL.test(part)) throw protectionError();
      const decoded = Buffer.from(part, 'base64url');
      if (decoded.toString('base64url') !== part || (length !== undefined && decoded.length !== length)) throw protectionError();
      return decoded;
    };
    const decodedCiphertext = decode(ciphertext, undefined);
    if (decodedCiphertext.length > MAX_PLAINTEXT_BYTES) throw protectionError();
    return { keyId, iv: decode(iv, 12), ciphertext: decodedCiphertext, tag: decode(tag, 16) };
  } catch {
    throw protectionError();
  }
}

function loadConfig(config: UserDataProtectionConfig): { keys: Map<string, Buffer>; activeKeyId: string; lookupKey: Buffer } {
  const keys = new Map<string, Buffer>();
  let lookupKey: Buffer | undefined;
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw configError();
    const configuredKeys: unknown = config.keys === undefined
      ? JSON.parse(process.env.FITNESS_USER_ENCRYPTION_KEYS ?? '')
      : config.keys;
    if (!configuredKeys || typeof configuredKeys !== 'object' || Array.isArray(configuredKeys)) throw configError();
    const entries = Object.entries(configuredKeys);
    if (!entries.length) throw configError();
    for (const [keyId, value] of entries) {
      if (!KEY_ID.test(keyId)) throw configError();
      keys.set(keyId, decodeKey(value));
    }
    const activeKeyId = config.activeKeyId === undefined ? process.env.FITNESS_USER_ENCRYPTION_ACTIVE_KEY : config.activeKeyId;
    if (typeof activeKeyId !== 'string' || !KEY_ID.test(activeKeyId) || !keys.has(activeKeyId)) throw configError();
    lookupKey = decodeKey(config.lookupKey === undefined ? process.env.FITNESS_USER_LOOKUP_KEY : config.lookupKey);
    for (const key of keys.values()) {
      if (lookupKey.equals(key)) throw configError();
    }
    return { keys, activeKeyId, lookupKey };
  } catch {
    for (const key of keys.values()) key.fill(0);
    keys.clear();
    lookupKey?.fill(0);
    throw configError();
  }
}

export class UserDataProtectionPlugin extends Service implements FitnessUserDataProtection {
  static provide = 'fitnessUserDataProtection';
  #keys = new Map<string, Buffer>();
  #lookupKey: Buffer | undefined;
  #activeKeyId = '';
  #closed = false;

  constructor(ctx: Context, config: UserDataProtectionConfig = {}) {
    const material = loadConfig(config);
    try {
      super(ctx, 'fitnessUserDataProtection');
      this.#keys = material.keys;
      this.#activeKeyId = material.activeKeyId;
      this.#lookupKey = material.lookupKey;
      ctx.effect(() => () => this.#dispose());
    } catch {
      for (const key of material.keys.values()) key.fill(0);
      material.keys.clear();
      material.lookupKey.fill(0);
      throw configError();
    }
  }

  // Cordis wraps services in a Proxy; arrows retain the instance's private-field receiver.
  seal = (context: readonly string[], plaintext: string): string => {
    this.#assertActive();
    const parts = validateContext(context);
    validatePlaintext(plaintext);
    try {
      const key = this.#keys.get(this.#activeKeyId)!;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      cipher.setAAD(Buffer.from(JSON.stringify(['fitness-users-v1', ...parts]), 'utf8'));
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return ['v1', this.#activeKeyId, iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
    } catch {
      throw protectionError();
    }
  }

  open = (context: readonly string[], envelope: string): string => {
    this.#assertActive();
    const parts = validateContext(context);
    const { keyId, iv, ciphertext, tag } = parseEnvelope(envelope);
    const plaintextBuffers: Buffer[] = [];
    try {
      const key = this.#keys.get(keyId);
      if (!key) throw protectionError();
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(JSON.stringify(['fitness-users-v1', ...parts]), 'utf8'));
      decipher.setAuthTag(tag);
      plaintextBuffers.push(decipher.update(ciphertext));
      plaintextBuffers.push(decipher.final());
      const plaintext = Buffer.concat(plaintextBuffers);
      plaintextBuffers.push(plaintext);
      return plaintext.toString('utf8');
    } catch {
      throw protectionError();
    } finally {
      for (const buffer of plaintextBuffers) buffer.fill(0);
    }
  }

  fingerprint = (context: readonly string[], plaintext: string): string => {
    this.#assertActive();
    const parts = validateContext(context);
    validatePlaintext(plaintext);
    try {
      return createHmac('sha256', this.#lookupKey!)
        .update(JSON.stringify(['fitness-users-lookup-v1', parts, plaintext]), 'utf8')
        .digest('hex');
    } catch {
      throw protectionError();
    }
  }

  needsRotation = (envelope: string): boolean => {
    this.#assertActive();
    const { keyId } = parseEnvelope(envelope);
    if (!this.#keys.has(keyId)) throw protectionError();
    // Authentication requires the caller's context and is performed by open().
    return keyId !== this.#activeKeyId;
  }

  #assertActive(): void {
    if (this.#closed) throw protectionError();
  }

  #dispose(): void {
    this.#closed = true;
    for (const key of this.#keys.values()) key.fill(0);
    this.#keys.clear();
    this.#lookupKey?.fill(0);
    this.#lookupKey = undefined;
    this.#activeKeyId = '';
  }
}
