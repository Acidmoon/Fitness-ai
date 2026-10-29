import type {} from 'cordis';
import type { UserAccount, UserProfile } from './user-contracts.ts';

/**
 * Authentication contract for the minimal account system.
 *
 * This layer owns password verification, session tokens and the authenticated
 * principal. It is deliberately separate from `fitnessUsers`: the database
 * plugin never performs login, password checks, token issuance or authorization
 * policy, and this plugin never trusts a tenant or actor supplied by a client.
 */

/** Login identifier. Reuses the identity provider semantics of `fitnessUsers`. */
export interface AuthIdentityInput {
  readonly provider: string;
  readonly subject: string;
}

export interface RegisterRequest {
  readonly schemaVersion: '1.0';
  readonly identity: AuthIdentityInput;
  readonly password: string;
  readonly profile: UserProfile;
}

export interface LoginRequest {
  readonly schemaVersion: '1.0';
  readonly identity: AuthIdentityInput;
  readonly password: string;
}

export interface ChangePasswordRequest {
  readonly schemaVersion: '1.0';
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface AuthSession {
  readonly schemaVersion: '1.0';
  /**
   * Opaque bearer token. Returned once, at register or login; the database keeps
   * only a keyed fingerprint, so the token itself is never recoverable.
   */
  readonly token: string;
  readonly expiresAt: string;
  readonly user: UserAccount;
}

/**
 * The authenticated principal resolved from a token. `tenantId` and `userId`
 * come from the session row, never from a request body or query string.
 */
export interface AuthPrincipal {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * Password policy shared by the plugin and every client: length is counted in
 * Unicode code points, whitespace-only values are rejected, no composition rules.
 */
export const AUTH_PASSWORD_MIN_CODEPOINTS = 10;
export const AUTH_PASSWORD_MAX_CODEPOINTS = 128;

export interface FitnessAuth {
  /** Creates the account, its credential and a first session; `AUTH_CONFLICT` if the identity is taken. */
  register(value: unknown): Promise<AuthSession>;
  /** `AUTH_INVALID_CREDENTIALS` for a wrong password and an unknown identity alike; `AUTH_LOCKED` while locked. */
  login(value: unknown): Promise<AuthSession>;
  /**
   * Verifies a bearer token. Sessions that are expired, revoked, or belong to an
   * account that is no longer `active` are rejected with `AUTH_UNAUTHENTICATED`.
   */
  authenticate(token: string): Promise<AuthPrincipal>;
  /**
   * Revokes the current session. Idempotent: an unknown or already-revoked token is
   * a no-op, so logout cannot be used to probe whether a token exists.
   */
  logout(token: string): Promise<void>;
  /**
   * Replaces the password after verifying the current one
   * (`AUTH_INVALID_CREDENTIALS` when it does not match). A failed attempt does not
   * count towards the login lock. Other sessions of the user are revoked; the
   * session described by `principal.sessionId` stays usable.
   */
  changePassword(principal: AuthPrincipal, value: unknown): Promise<void>;
  /**
   * Revokes every session of one user, e.g. after suspension. Returns the count.
   * Tenant-scoped: a tenant other than the configured one is `TENANT_NOT_FOUND`.
   */
  revokeAll(tenantId: string, userId: string): Promise<number>;
}

declare module 'cordis' {
  interface Context {
    fitnessAuth: FitnessAuth;
  }
  interface Events {
    /** Emitted after a session is created; carries no token and no credentials. */
    'fitness/auth-session-created'(session: {
      readonly tenantId: string;
      readonly userId: string;
      readonly sessionId: string;
      readonly expiresAt: string;
    }): void;
  }
}
