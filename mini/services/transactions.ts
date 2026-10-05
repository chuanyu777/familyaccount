import { request } from '../lib/http';
import {
  centsToYuan,
  parseYuanToCents,
  requireCurrentLedger,
  todayIso,
} from './business-state';

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface TransactionInput {
  type: TransactionType;
  amount: string | number;
  accountId?: number;
  toAccountId?: number;
  categoryId?: number;
  categoryName?: string;
  occurredOn?: string;
  note?: string;
}

export interface TransactionPatch extends Partial<TransactionInput> {}

export interface TransactionRecord {
  id: number;
  type: TransactionType;
  amountCents?: number;
  amount?: string | number;
  occurredOn?: string;
  note?: string | null;
  accountId?: number;
  toAccountId?: number | null;
  categoryId?: number | null;
  createdByUserId?: number;
  created_by_user_id?: number;
  sourceType?: string;
  source_type?: string;
}

export interface TransactionPage {
  items: TransactionRecord[];
  page: number;
  pageSize: number;
  total: number;
  incomeTotalCents: number;
  expenseTotalCents: number;
  netCents: number;
}

function amount(value: string | number): number {
  const cents = parseYuanToCents(value);
  if (cents === null || cents <= 0) throw new Error('金额必须是大于 0 的有效金额');
  return centsToYuan(cents);
}

function transactionPayload(input: TransactionInput | TransactionPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) payload.type = input.type;
  if (input.amount !== undefined) payload.amount = amount(input.amount);
  if (input.accountId !== undefined) payload.accountId = input.accountId;
  if (input.toAccountId !== undefined) payload.toAccountId = input.toAccountId;
  if (input.categoryId !== undefined) payload.categoryId = input.categoryId;
  if (input.categoryName !== undefined) payload.categoryName = input.categoryName;
  if (input.occurredOn !== undefined) payload.occurredOn = input.occurredOn;
  if (input.note !== undefined) payload.note = input.note;
  return payload;
}

export async function listTransactions(options: {
  month?: string;
  type?: TransactionType;
  accountId?: number;
  page?: number;
  pageSize?: number;
} = {}): Promise<TransactionPage> {
  requireCurrentLedger();
  const query = Object.entries(options)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return request<TransactionPage>(`/api/transactions${query ? `?${query}` : ''}`);
}

export async function createTransaction(input: TransactionInput): Promise<unknown> {
  requireCurrentLedger();
  const payload = transactionPayload({ ...input, occurredOn: input.occurredOn ?? todayIso() });
  return request('/api/transactions', { method: 'POST', data: payload });
}

export async function updateTransaction(id: number, patch: TransactionPatch): Promise<unknown> {
  requireCurrentLedger();
  return request(`/api/transactions/${id}`, { method: 'PATCH', data: transactionPayload(patch) });
}

export async function deleteTransaction(id: number): Promise<void> {
  requireCurrentLedger();
  await request(`/api/transactions/${id}`, { method: 'DELETE' });
}

export function isGeneratedRepaymentTransaction(record: TransactionRecord): boolean {
  return (record.sourceType ?? record.source_type) === 'repayment';
}

function creatorId(record: TransactionRecord): number | undefined {
  return record.createdByUserId ?? record.created_by_user_id;
}

export function canEditTransaction(record: TransactionRecord, userId: number, role: string): boolean {
  return !isGeneratedRepaymentTransaction(record) && (role === 'OWNER' || creatorId(record) === userId);
}

export function canDeleteTransaction(record: TransactionRecord, userId: number, role: string): boolean {
  return canEditTransaction(record, userId, role);
}
