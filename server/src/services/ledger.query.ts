import type { Db } from '../db/connection';
import { toYuanString } from '../domain/money';
import { badRequest } from '../lib/httpError';
import type { TxnType } from './ledger';

export interface TxnFilter {
  month?: string; // 'YYYY-MM'，默认当前月
  type?: TxnType; // expense | income | transfer
  accountId?: number; // 命中 account_id 或 to_account_id
  memberId?: number;
  page?: number; // 默认 1
  pageSize?: number; // 默认 20
}

export interface TxnItem {
  id: number;
  type: TxnType;
  amountCents: number;
  amount: string; // 元字符串
  occurredOn: string;
  note: string | null;
  accountId: number;
  accountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  memberId: number | null;
  memberName: string | null;
  sourceType: string;
}

export interface TxnListResult {
  items: TxnItem[];
  page: number;
  pageSize: number;
  total: number;
  incomeTotalCents: number;
  expenseTotalCents: number;
  netCents: number;
}

function currentMonth(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

function toStr(raw: unknown): string {
  return String(raw);
}

function toNullableStr(raw: unknown): string | null {
  return raw === null || raw === undefined ? null : String(raw);
}

function toTxnItem(raw: Record<string, unknown>): TxnItem {
  const amountCents = Number(raw.amount_cents);
  const accountId = Number(raw.account_id);
  const toAccountId = raw.to_account_id === null || raw.to_account_id === undefined
    ? null
    : Number(raw.to_account_id);
  const categoryId = raw.category_id === null || raw.category_id === undefined
    ? null
    : Number(raw.category_id);
  const memberId = raw.member_id === null || raw.member_id === undefined
    ? null
    : Number(raw.member_id);
  return {
    id: Number(raw.id),
    type: toStr(raw.type) as TxnType,
    amountCents,
    amount: toYuanString(amountCents),
    occurredOn: toStr(raw.occurred_on),
    note: toNullableStr(raw.note),
    accountId,
    accountName: toNullableStr(raw.account_name),
    toAccountId,
    toAccountName: toNullableStr(raw.to_account_name),
    categoryId,
    categoryName: toNullableStr(raw.category_name),
    memberId,
    memberName: toNullableStr(raw.member_name),
    sourceType: toStr(raw.source_type),
  };
}

/**
 * 账目查询与筛选（纯读）。
 * 动态拼装 WHERE 片段，值一律走 ? 参数，杜绝字符串拼接注入。
 */
export function listTransactions(db: Db, filter: TxnFilter): TxnListResult {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('VALIDATION_FAILED', 'page 必须是不小于 1 的整数');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw badRequest('VALIDATION_FAILED', 'pageSize 必须是不小于 1 的整数');
  }

  const month = filter.month ?? currentMonth();

  // 仅拼 SQL 片段，参数统一收集
  const where: string[] = [];
  const params: (string | number)[] = [];

  where.push('t.occurred_on LIKE ?');
  params.push(`${month}%`);

  if (filter.type !== undefined) {
    where.push('t.type = ?');
    params.push(filter.type);
  }
  if (filter.accountId !== undefined && filter.accountId !== null) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filter.accountId, filter.accountId);
  }
  if (filter.memberId !== undefined && filter.memberId !== null) {
    where.push('t.member_id = ?');
    params.push(filter.memberId);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  // 总条数（分页用）
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM txn t ${whereClause}`)
    .get(...params) as { n: number };
  const total = Number(totalRow.n);

  // 合计：转账不计入 income/expense
  const totalsRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense
       FROM txn t ${whereClause}`
    )
    .get(...params) as { income: number; expense: number };
  const incomeTotalCents = Number(totalsRow.income);
  const expenseTotalCents = Number(totalsRow.expense);
  const netCents = incomeTotalCents - expenseTotalCents;

  // 当前页明细
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT t.id, t.type, t.amount_cents, t.occurred_on, t.note, t.account_id,
              t.to_account_id, t.category_id, t.member_id, t.source_type,
              a.name AS account_name,
              ta.name AS to_account_name,
              c.name AS category_name,
              m.name AS member_name
       FROM txn t
       LEFT JOIN account a ON a.id = t.account_id
       LEFT JOIN account ta ON ta.id = t.to_account_id
       LEFT JOIN category c ON c.id = t.category_id
       LEFT JOIN member m ON m.id = t.member_id
       ${whereClause}
       ORDER BY t.occurred_on DESC, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as Record<string, unknown>[];

  const items = rows.map(toTxnItem);

  return {
    items,
    page,
    pageSize,
    total,
    incomeTotalCents,
    expenseTotalCents,
    netCents,
  };
}
