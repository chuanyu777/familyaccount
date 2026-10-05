import { request } from '../lib/http';
import { activeEntries, centsToYuan, parseYuanToCents, requireCurrentLedger } from './business-state';

export interface Account { id: number; name: string; balanceCents?: number; balance?: string; isDefault?: boolean | number; archived?: boolean | number; }

export async function listAccounts(): Promise<Account[]> {
  requireCurrentLedger();
  return request<Account[]>('/api/accounts');
}

export function activeAccounts(accounts: Account[]): Account[] { return activeEntries(accounts); }

export function accountIdAtPickerIndex(accounts: Account[], value: string | number): number | null {
  return accounts[Number(value)]?.id ?? null;
}

export function preferredAccountId(accounts: Account[]): number | null {
  const active = activeAccounts(accounts);
  return active.find(({ isDefault }) => Boolean(isDefault))?.id ?? active[0]?.id ?? null;
}

export async function createAccount(name: string): Promise<Account> {
  requireCurrentLedger();
  return request<Account>('/api/accounts', { method: 'POST', data: { name: name.trim() } });
}

export async function updateAccount(id: number, name: string): Promise<Account> {
  requireCurrentLedger();
  return request<Account>(`/api/accounts/${id}`, { method: 'PATCH', data: { name: name.trim() } });
}

export async function calibrateAccount(id: number, balance: string): Promise<Account> {
  requireCurrentLedger();
  const text = balance.trim();
  const negative = text.startsWith('-');
  const cents = parseYuanToCents(negative ? text.slice(1) : text);
  if (cents === null) throw new Error('请输入有效的账户余额');
  return request<Account>(`/api/accounts/${id}/calibrate`, {
    method: 'PATCH', data: { balance: centsToYuan(negative ? -cents : cents) },
  });
}

export { archiveSharedResource, restoreSharedResource } from './business-state';
