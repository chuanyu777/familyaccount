import { request } from '../lib/http';
import { centsToYuan, parseYuanToCents, requireCurrentLedger } from './business-state';

export interface Liability { id: number; name: string; remainingCents?: number; remaining?: string; monthlyPaymentCents?: number; monthlyPayment?: string; paymentDay?: number; archived?: boolean | number; }
export interface Repayment { id: number; liability_id: number; amount_cents: number; amount?: string; occurred_on: string; account_id?: number; transaction_id?: number; created_by_user_id?: number; canEdit?: boolean; }

export function canEditRepayment(record: Repayment, userId: number, role: string): boolean {
  return role === 'OWNER' || record.created_by_user_id === userId;
}

function money(value: string | number): number {
  const cents = parseYuanToCents(value);
  if (cents === null || cents < 0) throw new Error('金额必须是非负的有效金额');
  return centsToYuan(cents);
}

export async function listLiabilities(): Promise<Liability[]> { requireCurrentLedger(); return request<Liability[]>('/api/liabilities'); }
export async function createLiability(input: { name: string; remaining: string | number; monthlyPayment?: string | number; paymentDay?: number }): Promise<Liability> {
  requireCurrentLedger();
  return request<Liability>('/api/liabilities', { method: 'POST', data: { name: input.name.trim(), remaining: money(input.remaining), monthlyPayment: money(input.monthlyPayment ?? 0), ...(input.paymentDay === undefined ? {} : { paymentDay: input.paymentDay }) } });
}
export async function updateLiability(id: number, input: Partial<{ name: string; remaining: string | number; monthlyPayment: string | number; paymentDay: number | null }>): Promise<Liability> {
  requireCurrentLedger();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.remaining !== undefined) data.remaining = money(input.remaining);
  if (input.monthlyPayment !== undefined) data.monthlyPayment = money(input.monthlyPayment);
  if (input.paymentDay !== undefined) data.paymentDay = input.paymentDay;
  return request<Liability>(`/api/liabilities/${id}`, { method: 'PATCH', data });
}
export async function listRepayments(liabilityId?: number): Promise<Repayment[]> { requireCurrentLedger(); return request<Repayment[]>(liabilityId === undefined ? '/api/repayments' : `/api/repayments?liabilityId=${liabilityId}`); }

export interface RepaymentInput { liabilityId: number; amount?: string | number; accountId?: number; occurredOn?: string; note?: string; }
function repaymentPayload(input: RepaymentInput): Record<string, unknown> {
  const data: Record<string, unknown> = { liabilityId: input.liabilityId };
  if (input.amount !== undefined) data.amount = money(input.amount);
  if (input.accountId !== undefined) data.accountId = input.accountId;
  if (input.occurredOn !== undefined) data.occurredOn = input.occurredOn;
  if (input.note !== undefined) data.note = input.note;
  return data;
}
export async function createRepayment(input: RepaymentInput): Promise<Repayment> { requireCurrentLedger(); return request<Repayment>('/api/repayments', { method: 'POST', data: repaymentPayload(input) }); }
export async function updateRepayment(id: number, input: RepaymentInput): Promise<Repayment> { requireCurrentLedger(); return request<Repayment>(`/api/repayments/${id}`, { method: 'PUT', data: repaymentPayload(input) }); }
export async function deleteRepayment(id: number): Promise<void> { requireCurrentLedger(); await request(`/api/repayments/${id}`, { method: 'DELETE' }); }
export { archiveSharedResource, restoreSharedResource } from './business-state';
