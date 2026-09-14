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
  memberId?: number;
  memberName?: string;
  sourceType?: SourceType;
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
  balance: number;
  balance_cents: number;
  member_id?: number;
  is_default: boolean;
}

export interface Member {
  id: number;
  name: string;
  color?: string;
}

export interface Category {
  id: number;
  kind: 'expense' | 'income';
  name: string;
}

export const DEFAULT_EXPENSE_CATEGORY = '其他';
export const DEFAULT_INCOME_CATEGORY = '其他收入';
export const DEFAULT_MEMBER_NAME = '我';
