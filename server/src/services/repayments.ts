import type { Db } from '../db/connection';
import { toCents, toYuanString } from '../domain/money';
import { badRequest, notFound } from '../lib/httpError';
import { applyBalanceDelta, getAccount } from './accounts';
import { getDefaultAccount } from '../db/seed';
import { ensureDefaultCategory } from './categories';
import { getLiability } from './liabilities';
import type { TxnType, TxnRow } from './ledger';

export interface RepaymentRow {
  id: number;
  liability_id: number;
  amount_cents: number;
  occurred_on: string;
  account_id: number;
  transaction_id: number | null;
  created_at: string;
  /** 元字符串（两位） */
  amount: string;
}

const TXN_COLS =
  'id, type, amount_cents, occurred_on, note, account_id, to_account_id, category_id, member_id, source_type, source_id, created_at';

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toRepaymentRow(raw: Record<string, unknown>): RepaymentRow {
  const amount_cents = Number(raw.amount_cents);
  return {
    id: Number(raw.id),
    liability_id: Number(raw.liability_id),
    amount_cents,
    occurred_on: String(raw.occurred_on),
    account_id: Number(raw.account_id),
    transaction_id: raw.transaction_id === null ? null : Number(raw.transaction_id),
    created_at: String(raw.created_at),
    amount: toYuanString(amount_cents),
  };
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

export function listRepayments(db: Db, liabilityId?: number): RepaymentRow[] {
  const rows = liabilityId === undefined
    ? (db.prepare('SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at FROM repayment ORDER BY id').all() as Record<string, unknown>[])
    : (db.prepare('SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at FROM repayment WHERE liability_id = ? ORDER BY id').all(liabilityId) as Record<string, unknown>[]);
  return rows.map(toRepaymentRow);
}

export interface CreateRepaymentInput {
  liabilityId: number;
  amount?: number | string;
  occurredOn?: string;
  accountId?: number;
  memberId?: number | null;
  note?: string | null;
}

export interface CreateRepaymentResult {
  repayment: RepaymentRow;
  transaction: TxnRow;
  liability: ReturnType<typeof getLiability>;
}

/**
 * 创建一笔还款。整个方法在同一事务内：校验 → 插入 repayment → 插入还款支出 txn
 * （source_type='repayment'）→ 账户余额 applyBalanceDelta 扣减 → 负债本金扣减 → 回填 transaction_id。
 * 余额变动只允许走 applyBalanceDelta，绝不直接 UPDATE account 表。
 */
export function createRepayment(db: Db, input: CreateRepaymentInput): CreateRepaymentResult {
  db.exec('BEGIN');
  try {
    // 1) 校验负债存在
    const liability = getLiability(db, input.liabilityId); // 不存在抛 LIABILITY_NOT_FOUND

    // 2) 校验账户（默认用默认账户）
    const accountId = input.accountId ?? getDefaultAccount(db)?.id;
    if (accountId == null) {
      throw notFound('ACCOUNT_NOT_FOUND', '缺少默认账户，无法还款');
    }
    getAccount(db, accountId); // 不存在抛 ACCOUNT_NOT_FOUND

    // 3) 金额
    let amountCents: number;
    if (input.amount === undefined || input.amount === null) {
      if (liability.monthly_payment_cents === 0) {
        throw badRequest('VALIDATION_FAILED', '负债月供为 0，必须指定还款金额');
      }
      amountCents = liability.monthly_payment_cents;
    } else {
      try {
        amountCents = toCents(input.amount);
      } catch {
        throw badRequest('VALIDATION_FAILED', '还款金额格式非法');
      }
    }
    if (amountCents <= 0) {
      throw badRequest('VALIDATION_FAILED', '还款金额必须大于 0');
    }
    if (amountCents > liability.remaining_cents) {
      const over = amountCents - liability.remaining_cents;
      throw badRequest(
        'VALIDATION_FAILED',
        `还款金额超过剩余本金 ${toYuanString(over)}元`
      );
    }

    const occurredOn = input.occurredOn?.trim() || todayLocal();
    const categoryId = ensureDefaultCategory(db, 'expense').id;
    const note = input.note ?? `还款 - ${liability.name}`;

    // 4) 插入 repayment 记录
    const repRes = db
      .prepare(
        'INSERT INTO repayment (liability_id, amount_cents, occurred_on, account_id) VALUES (?, ?, ?, ?)'
      )
      .run(liability.id, amountCents, occurredOn, accountId);
    const repaymentId = Number(repRes.lastInsertRowid);

    // 5) 生成一笔还款支出 txn（直接 INSERT，因为要设 source_type='repayment'）
    const txnRes = db
      .prepare(
        `INSERT INTO txn (type, amount_cents, occurred_on, note, account_id, category_id, member_id, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'repayment', ?)`
      )
      .run(
        'expense',
        amountCents,
        occurredOn,
        note,
        accountId,
        categoryId,
        input.memberId ?? null,
        repaymentId
      );
    const transactionId = Number(txnRes.lastInsertRowid);

    // 6) 账户余额扣减（只走 applyBalanceDelta）
    applyBalanceDelta(db, accountId, -amountCents);
    // 7) 负债本金扣减
    db.prepare('UPDATE liability SET remaining_cents = remaining_cents - ? WHERE id = ?').run(
      amountCents,
      liability.id
    );
    // 8) 回写 transaction_id
    db.prepare('UPDATE repayment SET transaction_id = ? WHERE id = ?').run(transactionId, repaymentId);

    db.exec('COMMIT');
    const repayment = toRepaymentRow(
      db.prepare('SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at FROM repayment WHERE id = ?').get(repaymentId) as Record<string, unknown>
    );
    const transaction = toTxnRow(
      db.prepare(`SELECT ${TXN_COLS} FROM txn WHERE id = ?`).get(transactionId) as Record<string, unknown>
    );
    return { repayment, transaction, liability: getLiability(db, liability.id) };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * 删除一笔还款并完整反向回滚：账户余额 +amount、负债本金 +amount、删除关联支出 txn、删除还款记录。
 * 同一事务。
 */
export function deleteRepayment(db: Db, id: number): void {
  db.exec('BEGIN');
  try {
    const rep = db
      .prepare('SELECT id, liability_id, amount_cents, account_id FROM repayment WHERE id = ?')
      .get(id) as
      | { id: number; liability_id: number; amount_cents: number; account_id: number }
      | undefined;
    if (!rep) {
      throw notFound('REPAYMENT_NOT_FOUND', `还款 ${id} 不存在`);
    }
    // ① 账户余额回滚
    applyBalanceDelta(db, rep.account_id, rep.amount_cents);
    // ② 负债本金回滚
    db.prepare('UPDATE liability SET remaining_cents = remaining_cents + ? WHERE id = ?').run(
      rep.amount_cents,
      rep.liability_id
    );
    // ③ 删除关联支出 txn
    db.prepare("DELETE FROM txn WHERE source_type = 'repayment' AND source_id = ?").run(rep.id);
    // ④ 删除还款记录
    db.prepare('DELETE FROM repayment WHERE id = ?').run(rep.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
