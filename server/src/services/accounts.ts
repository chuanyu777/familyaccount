import type { Db } from '../db/connection';
import { toYuanString } from '../domain/money';
import { AppError, badRequest, notFound, conflict } from '../lib/httpError';

export interface AccountRow {
  id: number;
  name: string;
  balance_cents: number;
  member_id: number | null;
  is_default: number;
  created_at: string;
}

export interface AccountWithBalance extends AccountRow {
  balance: string;
}

const SELECT_COLS = 'id, name, balance_cents, member_id, is_default, created_at';

function toAccountRow(raw: Record<string, unknown>): AccountRow {
  return {
    id: Number(raw.id),
    name: String(raw.name),
    balance_cents: Number(raw.balance_cents),
    member_id: raw.member_id === null ? null : Number(raw.member_id),
    is_default: Number(raw.is_default),
    created_at: String(raw.created_at),
  };
}

export function listAccounts(db: Db): AccountWithBalance[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM account ORDER BY id`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => {
    const row = toAccountRow(r);
    return { ...row, balance: toYuanString(row.balance_cents) };
  });
}

export function getAccount(db: Db, id: number): AccountRow {
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM account WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('ACCOUNT_NOT_FOUND', `账户 ${id} 不存在`);
  }
  return toAccountRow(row);
}

export function createAccount(
  db: Db,
  input: { name: string; memberId?: number | null }
): AccountRow {
  const name = input.name.trim();
  if (name === '') {
    throw badRequest('VALIDATION_FAILED', '账户名称不能为空');
  }
  if (input.memberId !== undefined && input.memberId !== null) {
    const m = db.prepare('SELECT id FROM member WHERE id = ?').get(input.memberId);
    if (!m) {
      throw notFound('MEMBER_NOT_FOUND', `成员 ${input.memberId} 不存在`);
    }
  }
  const res = db
    .prepare('INSERT INTO account (name, balance_cents, member_id) VALUES (?, ?, ?)')
    .run(name, 0, input.memberId ?? null);
  const id = Number(res.lastInsertRowid);
  return getAccount(db, id);
}

export function updateAccount(
  db: Db,
  id: number,
  patch: { name?: string; memberId?: number | null }
): AccountRow {
  const existing = db.prepare('SELECT id FROM account WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ACCOUNT_NOT_FOUND', `账户 ${id} 不存在`);
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') {
      throw badRequest('VALIDATION_FAILED', '账户名称不能为空');
    }
    db.prepare('UPDATE account SET name = ? WHERE id = ?').run(name, id);
  }
  if (patch.memberId !== undefined) {
    if (patch.memberId !== null) {
      const m = db.prepare('SELECT id FROM member WHERE id = ?').get(patch.memberId);
      if (!m) {
        throw notFound('MEMBER_NOT_FOUND', `成员 ${patch.memberId} 不存在`);
      }
    }
    db.prepare('UPDATE account SET member_id = ? WHERE id = ?').run(patch.memberId, id);
  }
  return getAccount(db, id);
}

export function setDefaultAccount(db: Db, id: number): void {
  const existing = db.prepare('SELECT id FROM account WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ACCOUNT_NOT_FOUND', `账户 ${id} 不存在`);
  }
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE account SET is_default = 0').run();
    db.prepare('UPDATE account SET is_default = 1 WHERE id = ?').run(id);
    const row = db
      .prepare('SELECT COUNT(*) AS n FROM account WHERE is_default = 1')
      .get() as { n: number };
    if (row.n !== 1) {
      throw new AppError('切换默认账户后存在多个默认账户', 'INTERNAL', 500);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function calibrateBalance(db: Db, id: number, cents: number): AccountRow {
  const existing = db.prepare('SELECT id FROM account WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ACCOUNT_NOT_FOUND', `账户 ${id} 不存在`);
  }
  db.prepare('UPDATE account SET balance_cents = ? WHERE id = ?').run(cents, id);
  return getAccount(db, id);
}

export function applyBalanceDelta(db: Db, id: number, cents: number): void {
  db.prepare('UPDATE account SET balance_cents = balance_cents + ? WHERE id = ?').run(cents, id);
}

export function countTransactions(db: Db, accountId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM txn WHERE account_id = ? OR to_account_id = ?')
    .get(accountId, accountId) as { n: number };
  return row.n;
}

export function deleteAccount(db: Db, id: number): void {
  const existing = db.prepare('SELECT id FROM account WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ACCOUNT_NOT_FOUND', `账户 ${id} 不存在`);
  }
  const n = countTransactions(db, id);
  if (n > 0) {
    throw conflict('ACCOUNT_IN_USE', `账户 ${id} 已关联 ${n} 笔交易，无法删除`);
  }
  db.prepare('DELETE FROM account WHERE id = ?').run(id);
}
