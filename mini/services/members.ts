import { currentLedgerStore } from '../lib/currentLedger';
import { ApiError } from '../lib/errors';
import { request } from '../lib/http';
import { leaveLedger } from './ledgers';
import type { LedgerSummary } from '../types/domain';

export interface LedgerContext extends LedgerSummary {
  webEnabled?: boolean;
}

export interface LedgerMember {
  id: number;
  ledgerId: number;
  userId: number;
  role: string;
  active: boolean;
  displayName: string;
}

export function getSettingsCapabilities(role: string) {
  const isOwner = role === 'OWNER';
  return {
    canInvite: isOwner,
    canRemoveMembers: isOwner,
    canRename: isOwner,
    canArchiveResources: isOwner,
    canEditSharedResources: true,
    canLeave: !isOwner,
  };
}

export function canRemoveMember(currentRole: string, memberRole: string): boolean {
  return currentRole === 'OWNER' && memberRole !== 'OWNER';
}

function requireOwner(): void {
  if (currentLedgerStore.get()?.role !== 'OWNER') {
    throw new ApiError(403, 'LEDGER_OWNER_REQUIRED', '只有账本所有者可以执行此操作');
  }
}

export function loadLedgerContext(ledgerId: number): Promise<LedgerContext> {
  return request<LedgerContext>(`/api/ledgers/${ledgerId}`);
}

export function listMembers(ledgerId: number): Promise<LedgerMember[]> {
  return request<LedgerMember[]>(`/api/ledgers/${ledgerId}/members`);
}

export function removeMember(_ledgerId: number, membershipId: number): Promise<void> {
  requireOwner();
  return request<void>(`/api/memberships/${membershipId}`, { method: 'DELETE' });
}

export function leaveMemberLedger(ledgerId: number): Promise<void> {
  return leaveLedger(ledgerId);
}

export function updateLedgerName(ledgerId: number, name: string): Promise<LedgerSummary> {
  requireOwner();
  return request<LedgerSummary>(`/api/ledgers/${ledgerId}`, {
    method: 'PATCH', data: { name },
  });
}
