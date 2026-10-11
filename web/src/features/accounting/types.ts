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
  /** 分类图标代号（由后端从分类表带出）；无分类（转账/未分类）为空。 */
  categoryIconKey?: string | null;
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
  /** 图标代号，由后端按分类名匹配词典自动分配；未知 key 渲染兜底图标。 */
  icon_key?: string | null;
}

export const DEFAULT_EXPENSE_CATEGORY = '其他';
export const DEFAULT_INCOME_CATEGORY = '其他收入';
