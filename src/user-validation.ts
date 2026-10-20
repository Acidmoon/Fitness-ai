import { domainToASCII } from 'node:url';
import { FitnessError } from './contracts.ts';
import type { IdentityInput, UserMutationContext, UserProfile } from './user-contracts.ts';

export function invalid(message: string): never { throw new FitnessError('USER_INVALID', message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('输入必须是对象');
  return value as Record<string, unknown>;
}
export function exact(data: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) invalid('输入包含未声明字段');
}
export function text(value: unknown, name: string, max = 100): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) invalid(`${name} 格式无效`);
  return value;
}
export function uuid(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) invalid(`${name} 必须是 UUID`);
  return value.toLowerCase();
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) invalid(`${name} 格式无效`);
  return value;
}
export function mutation(value: unknown): UserMutationContext {
  const data = object(value);
  exact(data, ['actorId', 'operationId']);
  const actor = text(data.actorId, 'actorId', 80);
  const actorId = /^system:[a-z][a-z0-9._-]{0,63}$/.test(actor) ? actor : uuid(actor, 'actorId');
  return Object.freeze({ actorId, operationId: uuid(data.operationId, 'operationId') });
}
export function profile(value: unknown): UserProfile {
  const data = object(value);
  exact(data, ['displayName', 'locale', 'timeZone', 'avatarAssetId']);
  const displayName = text(data.displayName, 'displayName').trim().normalize('NFC');
  const localeValue = text(data.locale, 'locale', 35);
  let locale: string;
  let timeZone: string;
  try {
    locale = Intl.getCanonicalLocales(localeValue)[0]!;
    timeZone = new Intl.DateTimeFormat('en', { timeZone: text(data.timeZone, 'timeZone', 64) }).resolvedOptions().timeZone;
  } catch { invalid('locale 或 timeZone 格式无效'); }
  if (data.avatarAssetId !== null && typeof data.avatarAssetId !== 'string') invalid('avatarAssetId 必须是 UUID 或 null');
  return Object.freeze({ displayName, locale, timeZone, avatarAssetId: data.avatarAssetId === null ? null : uuid(data.avatarAssetId, 'avatarAssetId') });
}
export function identity(value: unknown, requireVerification = true): IdentityInput {
  const data = object(value);
  exact(data, requireVerification ? ['provider', 'subject', 'verified'] : ['provider', 'subject']);
  const provider = text(data.provider, 'provider', 64);
  if (!/^[a-z][a-z0-9._:-]{0,63}$/.test(provider)) invalid('provider 格式无效');
  let subject = text(data.subject, 'subject', 512);
  if (provider === 'email') {
    const parts = subject.trim().split('@');
    if (parts.length !== 2) invalid('email 格式无效');
    const local = parts[0]!.toLowerCase();
    const domain = domainToASCII(parts[1]!.toLowerCase());
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !domain.includes('.') || domain.length > 253 || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) invalid('email 格式无效');
    subject = `${local}@${domain}`;
    if (subject.length > 254) invalid('email 格式无效');
  } else if (provider === 'phone') {
    subject = subject.trim();
    if (!/^\+[1-9][0-9]{7,14}$/.test(subject)) invalid('phone 必须使用国际号码格式');
  }
  if (requireVerification && typeof data.verified !== 'boolean') invalid('verified 必须是布尔值');
  return Object.freeze({ provider, subject, verified: requireVerification ? data.verified as boolean : false });
}
export function base(value: unknown, extras: readonly string[], create = false) {
  const data = object(value);
  exact(data, ['schemaVersion', 'tenantId', 'mutation', ...(create ? [] : ['userId', 'expectedVersion']), ...extras]);
  if (data.schemaVersion !== '1.0') invalid('schemaVersion 仅支持 1.0');
  return {
    data, tenantId: uuid(data.tenantId, 'tenantId'), mutation: mutation(data.mutation),
    userId: create ? undefined : uuid(data.userId, 'userId'),
    expectedVersion: create ? undefined : integer(data.expectedVersion, 'expectedVersion', 1, 2_147_483_646),
  };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>;
    return `{${Object.keys(data).filter(key => data[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(data[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function workerId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) invalid('workerId 格式无效');
  return value;
}
