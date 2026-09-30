export type TransactionType = 'expense' | 'income' | 'transfer';
export type SourceType = 'manual' | 'repayment' | string;

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: number;
  amountCents: number;
  occurredOn: string;
  note?: string;
  accountId?: number;
  accountName?: string;
  toAccountId?: number;
  toAccountName?: string;
  categoryId?: number;
  categoryName?: string;
  createdByUserId?: number;
  sourceType?: SourceType;
  /** Legacy response compatibility; the UI never edits or filters by these fields. */
  memberId?: number;
  memberName?: string;
}

export interface TransactionsResponse {
  items: Transaction[];
  page: number;
  pageSize: number;
  total: number;
  incomeTotalCents: number;
  expenseTotalCents: number;
  netCents: number;
}

export interface Account {
  id: number;
  name: string;
  balance: number | string;
  balanceCents?: number;
  isDefault?: number | boolean;
  /** Temporary read compatibility for old cached responses and test fixtures. */
  balance_cents?: number;
  is_default?: number | boolean;
  archived?: number | boolean;
}

export interface Member { id: number; name: string; color?: string; }

export interface Category {
  id: number;
  kind: 'expense' | 'income';
  name: string;
  archived?: number | boolean;
}

export const DEFAULT_EXPENSE_CATEGORY = '其他';
export const DEFAULT_INCOME_CATEGORY = '其他收入';
