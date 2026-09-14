import type { Db } from '../db/connection';
import { getDefaultAccount } from '../db/seed';
import { toCents } from '../domain/money';
import { badRequest, conflict, notFound } from '../lib/httpError';
import { applyBalanceDelta, getAccount } from './accounts';
import { listMembers } from './members';
import { ensureDefaultCategory, upsertCategory } from './categories';

export type TxnType = 'expense' | 'income' | 'transfer';

export interface CreateTxnInput {
  type: TxnType;
  amount: number | string;
  occurredOn?: string;
  note?: string | null;
  accountId?: number;
  toAccountId?: number | null;
  categoryId?: number | null;
  categoryName?: string | null;
  memberId?: number | null;
}

export interface BalanceWarning {
  accountId: number;
  balanceCents: number;
}

export interface TxnRow {
  id: number;
  type: TxnType;
  amount_cents: number;
  occurred_on: string;
  note: string | null;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  member_id: number | null;
  source_type: string;
  source_id: number | null;
  created_at: string;
}

const TXN_COLS =
  'id, type, amount_cents, occurred_on, note, account_id, to_account_id, category_id, member_id, source_type, source_id, created_at';

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toTxnRow(raw: Record<string, unknown>): TxnRow {
  return {
    id: Number(raw.id),
    type: String(raw.type) as TxnType,
    amount_cents: Number(raw.amount_cents),
    occurred_on: String(raw.occurred_on),
    note: raw.note === null ? null : String(raw.note),
    account_id: Number(raw.account_id),
    to_account_id: raw.to_account_id === null ? null : Number(raw.to_account_id),
    category_id: raw.category_id === null ? null : Number(raw.category_id),
    member_id: raw.member_id === null ? null : Number(raw.member_id),
    source_type: String(raw.source_type),
    source_id: raw.source_id === null ? null : Number(raw.source_id),
    created_at: String(raw.created_at),
  };
}

function getTxnRow(db: Db, id: number): TxnRow {
  const row = db.prepare(`SELECT ${TXN_COLS} FROM txn WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    throw notFound('TXN_NOT_FOUND', `交易 ${id} 不存在`);
  }
  return toTxnRow(row);
}

function resolveMemberId(db: Db, provided: number | null | undefined): number | null {
  if (provided != null) return provided;
  const members = listMembers(db);
  const me = members.find((m) => m.name === '我');
  if (me) return me.id;
  const first = members[0];
  return first ? first.id : null;
}

function resolveCategoryId(
  db: Db,
  type: TxnType,
  input: { categoryId?: number | null; categoryName?: string | null }
): number | null {
  if (type === 'transfer') {
    return input.categoryId ?? null;
  }
  if (input.categoryName && input.categoryName.trim() !== '') {
    return upsertCategory(db, { kind: type, name: input.categoryName }).id;
  }
  if (input.categoryId != null) {
    return input.categoryId;
  }
  return ensureDefaultCategory(db, type).id;
}

function applyTxnToBalance(
  db: Db,
  type: TxnType,
  amountCents: number,
  accountId: number,
  toAccountId: number | null
): void {
  if (type === 'expense') {
    applyBalanceDelta(db, accountId, -amountCents);
  } else if (type === 'income') {
    applyBalanceDelta(db, accountId, amountCents);
  } else {
    applyBalanceDelta(db, accountId, -amountCents);
    applyBalanceDelta(db, toAccountId!, amountCents);
  }
}

function reverseTxnFromBalance(
  db: Db,
  type: TxnType,
  amountCents: number,
  accountId: number,
  toAccountId: number | null
): void {
  if (type === 'expense') {
    applyBalanceDelta(db, accountId, amountCents);
  } else if (type === 'income') {
    applyBalanceDelta(db, accountId, -amountCents);
  } else {
    applyBalanceDelta(db, accountId, amountCents);
    applyBalanceDelta(db, toAccountId!, -amountCents);
  }
}

function buildWarnings(db: Db, accountIds: number[]): BalanceWarning[] {
  const warnings: BalanceWarning[] = [];
  for (const aid of accountIds) {
    const r = db
      .prepare('SELECT balance_cents FROM account WHERE id = ?')
      .get(aid) as { balance_cents: number } | undefined;
    const bal = r ? Number(r.balance_cents) : 0;
    if (bal < 0) {
      warnings.push({ accountId: aid, balanceCents: bal });
    }
  }
  return warnings;
}

export function createTransaction(
  db: Db,
  input: CreateTxnInput
): { transaction: TxnRow; warnings: BalanceWarning[] } {
  const type = input.type;

  let amountCents: number;
  try {
    amountCents = toCents(input.amount);
  } catch {
    throw badRequest('VALIDATION_FAILED', '金额格式非法');
  }
  if (amountCents <= 0) {
    throw badRequest('VALIDATION_FAILED', '金额必须大于 0');
  }

  const accountId = input.accountId ?? getDefaultAccount(db)?.id;
  if (accountId == null) {
    throw badRequest('VALIDATION_FAILED', '缺少默认账户');
  }
  getAccount(db, accountId);

  let toAccountId: number | null = null;
  if (type === 'transfer') {
    if (input.toAccountId == null) {
      throw badRequest('VALIDATION_FAILED', '转账必须指定转入账户');
    }
    if (input.toAccountId === accountId) {
      throw badRequest('VALIDATION_FAILED', '转入账户不能与转出账户相同');
    }
    toAccountId = input.toAccountId;
    getAccount(db, toAccountId);
  }

  const occurredOn = input.occurredOn?.trim() || todayLocal();
  const note = input.note ?? null;
  const memberId = resolveMemberId(db, input.memberId ?? null);
  const categoryId = resolveCategoryId(db, type, input);

  const affectedAccounts: number[] = [accountId];
  if (type === 'transfer' && toAccountId != null) affectedAccounts.push(toAccountId);

  db.exec('BEGIN');
  try {
    applyTxnToBalance(db, type, amountCents, accountId, toAccountId);
    const res = db
      .prepare(
        `INSERT INTO txn (type, amount_cents, occurred_on, note, account_id, to_account_id, category_id, member_id, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
      )
      .run(type, amountCents, occurredOn, note, accountId, toAccountId, categoryId, memberId);
    db.exec('COMMIT');
    const id = Number(res.lastInsertRowid);
    const transaction = getTxnRow(db, id);
    const warnings = buildWarnings(db, affectedAccounts);
    return { transaction, warnings };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function updateTransaction(
  db: Db,
  id: number,
  patch: Partial<CreateTxnInput>
): { transaction: TxnRow; warnings: BalanceWarning[] } {
  const existing = getTxnRow(db, id); // 不存在抛 TXN_NOT_FOUND
  if (existing.source_type === 'repayment') {
    throw conflict('GENERATED_BY_REPAYMENT', '还款生成的记录不可直接修改');
  }

  const newType = patch.type ?? existing.type;

  let newAmountCents: number;
  if (patch.amount !== undefined) {
    try {
      newAmountCents = toCents(patch.amount);
    } catch {
      throw badRequest('VALIDATION_FAILED', '金额格式非法');
    }
    if (newAmountCents <= 0) {
      throw badRequest('VALIDATION_FAILED', '金额必须大于 0');
    }
  } else {
    newAmountCents = existing.amount_cents;
  }

  const newAccountId = patch.accountId ?? existing.account_id;
  const newToAccountId =
    patch.toAccountId !== undefined ? patch.toAccountId : existing.to_account_id;
  const newOccurredOn =
    patch.occurredOn === undefined
      ? existing.occurred_on
      : patch.occurredOn.trim() || todayLocal();
  const newNote = patch.note !== undefined ? patch.note : existing.note;
  const newMemberId =
    patch.memberId !== undefined ? resolveMemberId(db, patch.memberId) : existing.member_id;

  let newCategoryId: number | null;
  if (newType === 'transfer') {
    newCategoryId = patch.categoryId !== undefined ? patch.categoryId : existing.category_id;
  } else if (patch.categoryName != null && patch.categoryName.trim() !== '') {
    newCategoryId = upsertCategory(db, { kind: newType, name: patch.categoryName }).id;
  } else if (patch.categoryId !== undefined) {
    newCategoryId = patch.categoryId;
  } else {
    newCategoryId = existing.category_id;
  }

  db.exec('BEGIN');
  try {
    // 1) 校验新值：账户必须存在
    getAccount(db, newAccountId);
    let effToAccountId: number | null = null;
    if (newType === 'transfer') {
      if (newToAccountId == null) {
        throw badRequest('VALIDATION_FAILED', '转账必须指定转入账户');
      }
      if (newToAccountId === newAccountId) {
        throw badRequest('VALIDATION_FAILED', '转入账户不能与转出账户相同');
      }
      effToAccountId = newToAccountId;
      getAccount(db, effToAccountId);
    }
    // 2) 先完整回滚旧记录对账户的影响
    reverseTxnFromBalance(
      db,
      existing.type,
      existing.amount_cents,
      existing.account_id,
      existing.to_account_id
    );
    // 3) 再按新值应用
    applyTxnToBalance(db, newType, newAmountCents, newAccountId, effToAccountId);
    // 4) 更新记录
    db.prepare(
      `UPDATE txn SET type=?, amount_cents=?, occurred_on=?, note=?, account_id=?, to_account_id=?, category_id=?, member_id=? WHERE id=?`
    ).run(
      newType,
      newAmountCents,
      newOccurredOn,
      newNote,
      newAccountId,
      effToAccountId,
      newCategoryId,
      newMemberId,
      id
    );
    db.exec('COMMIT');
    const transaction = getTxnRow(db, id);
    const affected =
      newType === 'transfer' && effToAccountId != null
        ? [newAccountId, effToAccountId]
        : [newAccountId];
    const warnings = buildWarnings(db, affected);
    return { transaction, warnings };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function deleteTransaction(db: Db, id: number): void {
  const existing = getTxnRow(db, id); // 不存在抛 TXN_NOT_FOUND
  if (existing.source_type === 'repayment') {
    throw conflict('GENERATED_BY_REPAYMENT', '还款生成的记录不可直接删除');
  }
  db.exec('BEGIN');
  try {
    // 回滚账户影响后再删除
    reverseTxnFromBalance(
      db,
      existing.type,
      existing.amount_cents,
      existing.account_id,
      existing.to_account_id
    );
    db.prepare('DELETE FROM txn WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
