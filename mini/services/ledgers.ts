import { currentLedgerStore } from '../lib/currentLedger';
import { ApiError } from '../lib/errors';
import { invalidateLedgerScopedCache } from '../lib/ledgerCache';
import { request } from '../lib/http';
import type { InvitationPreview, InvitationView, LedgerMembership, LedgerSummary } from '../types/domain';

export function listLedgers(): Promise<LedgerSummary[]> {
  return request<LedgerSummary[]>('/api/ledgers');
}

export async function createLedger(name: string): Promise<LedgerSummary> {
  const ledger = await request<LedgerSummary>('/api/ledgers', { method: 'POST', data: { name } });
  currentLedgerStore.set(ledger);
  return ledger;
}

export async function acceptInvitation(token: string): Promise<LedgerMembership> {
  const membership = await request<LedgerMembership>('/api/invitations/accept', {
    method: 'POST', data: { token },
  });
  const ledger = await request<LedgerSummary>(`/api/ledgers/${membership.ledgerId}`);
  currentLedgerStore.set(ledger);
  return membership;
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return request<InvitationPreview>(`/api/invitations/preview?token=${encodeURIComponent(token)}`);
}

export function switchLedger(ledger: LedgerSummary): void {
  const previous = currentLedgerStore.get();
  if (previous && previous.id !== ledger.id) invalidateLedgerScopedCache(previous.id);
  currentLedgerStore.set(ledger);
  wx.reLaunch({ url: '/pages/ledger/home' });
}

export async function createInvitation(): Promise<InvitationView> {
  const ledger = currentLedgerStore.get();
  if (!ledger || ledger.role !== 'OWNER') {
    throw new ApiError(403, 'LEDGER_OWNER_REQUIRED', '只有账本所有者可以创建邀请');
  }
  return request<InvitationView>(`/api/ledgers/${ledger.id}/invitations`, { method: 'POST' });
}

export async function leaveLedger(ledgerId: number): Promise<void> {
  const current = currentLedgerStore.get();
  if (current?.id === ledgerId && current.role === 'OWNER') {
    throw new ApiError(409, 'OWNER_CANNOT_LEAVE', '账本所有者不能离开账本');
  }
  await request<void>(`/api/ledgers/${ledgerId}/leave`, { method: 'POST' });
  if (currentLedgerStore.get()?.id === ledgerId) currentLedgerStore.clear();
}
