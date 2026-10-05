import { currentLedgerStore } from '../lib/currentLedger';
import { ApiError } from '../lib/errors';
import { request } from '../lib/http';

export type SharedResourceKind = 'accounts' | 'assets' | 'liabilities' | 'categories';

export function requireCurrentLedger(): number {
  const ledger = currentLedgerStore.get();
  if (!ledger) throw new ApiError(400, 'LEDGER_REQUIRED', '请先选择账本');
  return ledger.id;
}

export function booleanLike(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function activeEntries<T extends { archived?: boolean | number | string }>(entries: T[]): T[] {
  return entries.filter((entry) => !booleanLike(entry.archived));
}

function requireOwner(): void {
  requireCurrentLedger();
  if (currentLedgerStore.get()?.role !== 'OWNER') {
    throw new ApiError(403, 'LEDGER_OWNER_REQUIRED', '只有账本所有者可以执行此操作');
  }
}

export async function archiveSharedResource(kind: SharedResourceKind, id: number): Promise<void> {
  requireOwner();
  await request<void>(`/api/${kind}/${id}/archive`, { method: 'POST' });
}

export async function restoreSharedResource(kind: SharedResourceKind, id: number): Promise<void> {
  requireOwner();
  await request<void>(`/api/${kind}/${id}/restore`, { method: 'POST' });
}

export function parseYuanToCents(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToYuan(cents: number): number {
  return cents / 100;
}

export function todayIso(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

export function assertPastOrCurrentMonth(month: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12 || month > currentMonth()) {
    throw new ApiError(400, 'FUTURE_MONTH', '月份不能晚于当前月份');
  }
}
