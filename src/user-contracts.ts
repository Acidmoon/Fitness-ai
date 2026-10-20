import type {} from 'cordis';

export type UserStatus = 'active' | 'suspended' | 'deleted';
export interface UserProfile {
  readonly displayName: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly avatarAssetId: string | null;
}
export interface UserIdentity {
  readonly id: string;
  readonly provider: string;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
}
export interface UserAccount {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly id: string;
  readonly status: UserStatus;
  readonly version: number;
  readonly profile: UserProfile | null;
  /** Subjects, email addresses and phone numbers are not present in this DTO. */
  readonly identities: readonly UserIdentity[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly erasedAt: string | null;
}
export interface UserMutationContext {
  /** Trusted caller: a user UUID or a bounded system:<service-name> identifier. */
  readonly actorId: string;
  /** Stable UUID reused only for an identical logical operation. */
  readonly operationId: string;
}
export interface IdentityInput {
  readonly provider: string;
  readonly subject: string;
  /** The authentication adapter must supply this only after verification. */
  readonly verified: boolean;
}
export interface CreateUserRequest {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly profile: UserProfile;
  readonly identity?: IdentityInput;
  readonly mutation: UserMutationContext;
}
export interface UpdateUserProfileRequest {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly userId: string;
  readonly expectedVersion: number;
  readonly profile: UserProfile;
  readonly mutation: UserMutationContext;
}
export interface ChangeUserStatusRequest {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly userId: string;
  readonly expectedVersion: number;
  readonly status: 'active' | 'suspended';
  readonly mutation: UserMutationContext;
}
export interface UserVersionRequest {
  readonly schemaVersion: '1.0';
  readonly tenantId: string;
  readonly userId: string;
  readonly expectedVersion: number;
  readonly mutation: UserMutationContext;
}
export interface LinkUserIdentityRequest extends UserVersionRequest { readonly identity: IdentityInput }
export interface UnlinkUserIdentityRequest extends UserVersionRequest { readonly identityId: string }
export interface UserWriteResult {
  readonly schemaVersion: '1.0';
  /** Current view on a retry, which can be newer than appliedVersion. */
  readonly user: UserAccount;
  readonly operationId: string;
  readonly appliedVersion: number;
  readonly replayed: boolean;
  readonly identityId: string | null;
}
export interface UserPage {
  readonly schemaVersion: '1.0';
  readonly items: readonly UserAccount[];
  readonly nextCursor: string | null;
}
export type UserChangeKind = 'user.created' | 'user.profile-updated' | 'user.status-changed'
  | 'user.identity-linked' | 'user.identity-unlinked' | 'user.erased' | 'user.encryption-rotated';
export interface UserChange {
  readonly schemaVersion: '1.0';
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly userVersion: number;
  readonly kind: UserChangeKind;
  readonly actorId: string;
  readonly operationId: string;
  readonly occurredAt: string;
}
export interface ClaimedUserChange {
  readonly event: UserChange;
  readonly leaseToken: string;
  readonly leaseUntil: string;
}
export interface FitnessUsers {
  create(value: unknown): Promise<UserWriteResult>;
  get(tenantId: string, userId: string): Promise<UserAccount | null>;
  list(tenantId: string, options?: { readonly limit?: number; readonly after?: string; readonly status?: UserStatus }): Promise<UserPage>;
  updateProfile(value: unknown): Promise<UserWriteResult>;
  changeStatus(value: unknown): Promise<UserWriteResult>;
  linkIdentity(value: unknown): Promise<UserWriteResult>;
  unlinkIdentity(value: unknown): Promise<UserWriteResult>;
  findByIdentity(tenantId: string, identity: { readonly provider: string; readonly subject: string }): Promise<UserAccount | null>;
  readIdentitySubject(tenantId: string, userId: string, identityId: string): Promise<string | null>;
  erase(value: unknown): Promise<UserWriteResult>;
  reencrypt(value: unknown): Promise<UserWriteResult>;
  /** At-least-once delivery; consumers must deduplicate by event.id. */
  claimChanges(tenantId: string, options: { readonly workerId: string; readonly limit?: number; readonly leaseMs?: number }): Promise<readonly ClaimedUserChange[]>;
  acknowledgeChange(tenantId: string, eventId: string, workerId: string, leaseToken: string): Promise<void>;
}

declare module 'cordis' {
  interface Context { fitnessUsers: FitnessUsers }
  interface Events {
    /** Best-effort wakeup after commit; the transactional outbox is authoritative. */
    'fitness/user-changed'(change: UserChange): void;
  }
}
