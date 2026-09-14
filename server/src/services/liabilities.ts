import type { Db } from '../db/connection';
import { toCents, toYuanString } from '../domain/money';
import { isValidMonth, lastDayOf } from '../domain/month';
import { badRequest, notFound } from '../lib/httpError';
import { applyBalanceDelta } from './accounts';

export interface LiabilityRow {
  id: number;
  name: string;
  remaining_cents: number;
  monthly_payment_cents: number;
  payment_day: number | null;
  member_id: number | null;
  /** 元字符串（两位），方便前端直出 */
  remaining: string;
  monthlyPayment: string;
}

const SELECT_COLS = 'id, name, remaining_cents, monthly_payment_cents, payment_day, member_id';

function toLiabilityRow(raw: Record<string, unknown>): LiabilityRow {
  const remaining_cents = Number(raw.remaining_cents);
  const monthly_payment_cents = Number(raw.monthly_payment_cents);
  return {
    id: Number(raw.id),
    name: String(raw.name),
    remaining_cents,
    monthly_payment_cents,
    payment_day: raw.payment_day === null ? null : Number(raw.payment_day),
    member_id: raw.member_id === null ? null : Number(raw.member_id),
    remaining: toYuanString(remaining_cents),
    monthlyPayment: toYuanString(monthly_payment_cents),
  };
}

/** 某月末的负债余额。历史值由「当前剩余 + 该月之后的还款」倒推，无需额外存表。 */
export interface LiabilityValueAtMonth {
  id: number;
  cents: number;
}

/**
 * 各负债在指定月末的剩余本金。
 *
 * 倒推法：remaining(月末 M) = remaining(现在) + Σ(还款 occurred_on > M 的最后一天)。
 * 因为每记一笔还款都会等额减少剩余本金，把 M 之后还掉的部分加回去即可。
 * 负债创建月晚于 M 时视为当时还不存在，记 0。
 */
export function liabilitiesAtMonth(db: Db, month: string): LiabilityValueAtMonth[] {
  if (!isValidMonth(month)) {
    throw badRequest('VALIDATION_FAILED', '月份需为 YYYY-MM');
  }
  const cutoff = lastDayOf(month);
  const rows = db
    .prepare('SELECT id, remaining_cents, monthly_payment_cents, created_at FROM liability ORDER BY id')
    .all() as { id: number; remaining_cents: number; monthly_payment_cents: number; created_at: string }[];
  const stmt = db.prepare(
    `SELECT COALESCE(SUM(amount_cents), 0) AS t
       FROM repayment WHERE liability_id = ? AND occurred_on > ?`
  );
  return rows.map((r) => {
    const createdMonth = String(r.created_at ?? '').slice(0, 7);
    if (createdMonth && createdMonth > month) {
      return { id: Number(r.id), cents: 0 };
    }
    const paidAfter = Number((stmt.get(r.id, cutoff) as { t: number }).t);
    return { id: Number(r.id), cents: Number(r.remaining_cents) + paidAfter };
  });
}

/** 指定月末的负债本金合计与月供合计（分）。 */
export function liabilitiesTotalAtMonth(
  db: Db,
  month: string
): { remainingCents: number; monthlyPaymentCents: number } {
  const values = liabilitiesAtMonth(db, month);
  const rows = db
    .prepare('SELECT id, monthly_payment_cents, created_at FROM liability')
    .all() as { id: number; monthly_payment_cents: number; created_at: string }[];
  const paymentById = new Map(
    rows
      .filter((r) => !String(r.created_at ?? '').slice(0, 7) || String(r.created_at).slice(0, 7) <= month)
      .map((r) => [Number(r.id), Number(r.monthly_payment_cents)])
  );
  return {
    remainingCents: values.reduce((s, v) => s + v.cents, 0),
    monthlyPaymentCents: values.reduce((s, v) => s + (paymentById.get(v.id) ?? 0), 0),
  };
}

/** 元（number|string）→ 分；非法输入统一转 VALIDATION_FAILED。 */
function parseCents(input: number | string, field: string): number {
  try {
    return toCents(input);
  } catch {
    throw badRequest('VALIDATION_FAILED', `${field}格式非法`);
  }
}

export function listLiabilities(db: Db): LiabilityRow[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM liability ORDER BY id`)
    .all() as Record<string, unknown>[];
  return rows.map(toLiabilityRow);
}

export function getLiability(db: Db, id: number): LiabilityRow {
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM liability WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('LIABILITY_NOT_FOUND', `负债 ${id} 不存在`);
  }
  return toLiabilityRow(row);
}

export interface CreateLiabilityInput {
  name: string;
  remaining: number | string;
  monthlyPayment?: number | string;
  paymentDay?: number | null;
  memberId?: number | null;
}

export function createLiability(db: Db, input: CreateLiabilityInput): LiabilityRow {
  const name = input.name.trim();
  if (name === '') {
    throw badRequest('VALIDATION_FAILED', '负债名称不能为空');
  }
  const remainingCents = parseCents(input.remaining, '本金');
  if (remainingCents < 0) {
    throw badRequest('VALIDATION_FAILED', '本金不能为负');
  }
  const monthlyCents =
    input.monthlyPayment === undefined ? 0 : parseCents(input.monthlyPayment, '月供');
  if (monthlyCents < 0) {
    throw badRequest('VALIDATION_FAILED', '月供不能为负');
  }
  let paymentDay: number | null = null;
  if (input.paymentDay !== undefined && input.paymentDay !== null) {
    const pd = input.paymentDay;
    if (!Number.isInteger(pd) || pd < 1 || pd > 31) {
      throw badRequest('VALIDATION_FAILED', '还款日必须在 1–31');
    }
    paymentDay = pd;
  }
  let memberId: number | null = null;
  if (input.memberId !== undefined && input.memberId !== null) {
    const m = db.prepare('SELECT id FROM member WHERE id = ?').get(input.memberId);
    if (!m) {
      throw notFound('MEMBER_NOT_FOUND', `成员 ${input.memberId} 不存在`);
    }
    memberId = input.memberId;
  }
  const res = db
    .prepare(
      'INSERT INTO liability (name, remaining_cents, monthly_payment_cents, payment_day, member_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, remainingCents, monthlyCents, paymentDay, memberId);
  return getLiability(db, Number(res.lastInsertRowid));
}

export interface UpdateLiabilityPatch {
  name?: string;
  remaining?: number | string;
  monthlyPayment?: number | string;
  paymentDay?: number | null;
  memberId?: number | null;
}

export function updateLiability(db: Db, id: number, patch: UpdateLiabilityPatch): LiabilityRow {
  const existing = db.prepare('SELECT id FROM liability WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('LIABILITY_NOT_FOUND', `负债 ${id} 不存在`);
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') {
      throw badRequest('VALIDATION_FAILED', '负债名称不能为空');
    }
    db.prepare('UPDATE liability SET name = ? WHERE id = ?').run(name, id);
  }
  if (patch.remaining !== undefined) {
    const cents = parseCents(patch.remaining, '本金');
    if (cents < 0) {
      throw badRequest('VALIDATION_FAILED', '本金不能为负');
    }
    db.prepare('UPDATE liability SET remaining_cents = ? WHERE id = ?').run(cents, id);
  }
  if (patch.monthlyPayment !== undefined) {
    const cents = parseCents(patch.monthlyPayment, '月供');
    if (cents < 0) {
      throw badRequest('VALIDATION_FAILED', '月供不能为负');
    }
    db.prepare('UPDATE liability SET monthly_payment_cents = ? WHERE id = ?').run(cents, id);
  }
  if (patch.paymentDay !== undefined) {
    if (patch.paymentDay === null) {
      db.prepare('UPDATE liability SET payment_day = NULL WHERE id = ?').run(id);
    } else {
      const pd = patch.paymentDay;
      if (!Number.isInteger(pd) || pd < 1 || pd > 31) {
        throw badRequest('VALIDATION_FAILED', '还款日必须在 1–31');
      }
      db.prepare('UPDATE liability SET payment_day = ? WHERE id = ?').run(pd, id);
    }
  }
  if (patch.memberId !== undefined) {
    if (patch.memberId === null) {
      db.prepare('UPDATE liability SET member_id = NULL WHERE id = ?').run(id);
    } else {
      const m = db.prepare('SELECT id FROM member WHERE id = ?').get(patch.memberId);
      if (!m) {
        throw notFound('MEMBER_NOT_FOUND', `成员 ${patch.memberId} 不存在`);
      }
      db.prepare('UPDATE liability SET member_id = ? WHERE id = ?').run(patch.memberId, id);
    }
  }
  return getLiability(db, id);
}

export interface DeleteLiabilityResult {
  deletedRepayments: number;
}

/**
 * 删除负债并级联清理其还款：同一事务内对每笔还款先回滚账户余额、删除其还款支出
 * txn、删除还款记录，最后删除负债本身。返回清理的还款笔数。
 */
export function deleteLiability(db: Db, id: number): DeleteLiabilityResult {
  const existing = db.prepare('SELECT id FROM liability WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('LIABILITY_NOT_FOUND', `负债 ${id} 不存在`);
  }
  db.exec('BEGIN');
  try {
    const repayments = db
      .prepare('SELECT id, amount_cents, account_id FROM repayment WHERE liability_id = ?')
      .all(id) as { id: number; amount_cents: number; account_id: number }[];
    for (const r of repayments) {
      // ① 回滚账户余额
      applyBalanceDelta(db, r.account_id, r.amount_cents);
      // ② 删除该还款生成的 txn
      db.prepare("DELETE FROM txn WHERE source_type = 'repayment' AND source_id = ?").run(r.id);
      // ③ 删除还款记录
      db.prepare('DELETE FROM repayment WHERE id = ?').run(r.id);
    }
    // ④ 删除负债本身
    db.prepare('DELETE FROM liability WHERE id = ?').run(id);
    db.exec('COMMIT');
    return { deletedRepayments: repayments.length };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
