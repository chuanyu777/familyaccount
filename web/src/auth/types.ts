export type WebAuthKind = 'ledger' | 'platform';

export interface SessionInfo {
  type: 'LEDGER_USER' | 'PLATFORM_ADMIN';
  userId?: number;
  platformAdminId?: number;
}

export interface LedgerSession extends SessionInfo {
  type: 'LEDGER_USER';
  userId: number;
}

export interface LedgerSummary {
  id: number;
  name: string;
  role: 'OWNER' | 'MEMBER' | string;
  active: boolean;
  webLoginAllowed: boolean;
}

export interface LedgerPermissions {
  isOwner?: boolean;
  canManageMembers?: boolean;
  canRenameLedger?: boolean;
  canArchiveResources?: boolean;
}

export interface PlatformSession extends SessionInfo {
  type: 'PLATFORM_ADMIN';
  platformAdminId: number;
}

export interface MiniBindingCode {
  code: string;
  expiresAt: string;
}

export function isLedgerSession(value: SessionInfo): value is LedgerSession {
  return value.type === 'LEDGER_USER' && typeof value.userId === 'number';
}

export function isPlatformSession(value: SessionInfo): value is PlatformSession {
  return value.type === 'PLATFORM_ADMIN' && typeof value.platformAdminId === 'number';
}
