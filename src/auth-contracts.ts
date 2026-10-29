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

export interface FitnessAuth {
  register(value: unknown): Promise<AuthSession>;
  login(value: unknown): Promise<AuthSession>;
  /** Verifies a bearer token; rejects with `AUTH_UNAUTHENTICATED` when unusable. */
  authenticate(token: string): Promise<AuthPrincipal>;
  logout(token: string): Promise<void>;
  changePassword(principal: AuthPrincipal, value: unknown): Promise<void>;
  /** Revokes every session of one user, e.g. after suspension. Returns the count. */
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
