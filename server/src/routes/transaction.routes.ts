import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { createTransaction, updateTransaction, deleteTransaction } from '../services/ledger';
import { listTransactions } from '../services/ledger.query';
import { parseIdParam } from './params';
import { notFound } from '../lib/httpError';
import { toYuanString } from '../domain/money';

/** /api/transactions —— 仅做参数校验、调用 service、错误映射。 */
export function transactionRoutes(db: Db): Router {
  const router = Router();

  const listQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    type: z.enum(['expense', 'income', 'transfer']).optional(),
    accountId: z.coerce.number().int().positive().optional(),
    memberId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
  });

  const txnBodySchema = z.object({
    type: z.enum(['expense', 'income', 'transfer']),
    amount: z.union([z.number(), z.string()]),
    occurredOn: z.string().optional(),
    note: z.string().nullable().optional(),
    accountId: z.number().int().positive().optional(),
    toAccountId: z.number().int().positive().nullable().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    categoryName: z.string().optional(),
    memberId: z.number().int().positive().nullable().optional(),
  });

  const txnPatchSchema = txnBodySchema.partial();

  router.get('/', (req, res, next) => {
    try {
      const q = listQuerySchema.parse(req.query);
      const result = listTransactions(db, {
        month: q.month,
        type: q.type,
        accountId: q.accountId,
        memberId: q.memberId,
        page: q.page,
        pageSize: q.pageSize,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = txnBodySchema.parse(req.body);
      const result = createTransaction(db, body);
      // 纯展示映射：补上 amount 元字符串（业务金额仍以 amount_cents 为准）
      res.status(201).json({
        transaction: { ...result.transaction, amount: toYuanString(result.transaction.amount_cents) },
        warnings: result.warnings,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const row = db
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
           WHERE t.id = ?`
        )
        .get(id) as Record<string, unknown> | undefined;
      if (!row) {
        throw notFound('TXN_NOT_FOUND', `交易 ${id} 不存在`);
      }
      const toNullable = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
      const amountCents = Number(row.amount_cents);
      res.json({
        id: Number(row.id),
        type: String(row.type),
        amountCents,
        amount: toYuanString(amountCents),
        occurredOn: String(row.occurred_on),
        note: toNullable(row.note),
        accountId: Number(row.account_id),
        accountName: toNullable(row.account_name),
        toAccountId: row.to_account_id == null ? null : Number(row.to_account_id),
        toAccountName: toNullable(row.to_account_name),
        categoryId: row.category_id == null ? null : Number(row.category_id),
        categoryName: toNullable(row.category_name),
        memberId: row.member_id == null ? null : Number(row.member_id),
        memberName: toNullable(row.member_name),
        sourceType: String(row.source_type),
      });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const patch = txnPatchSchema.parse(req.body);
      const result = updateTransaction(db, id, patch);
      res.json({
        transaction: { ...result.transaction, amount: toYuanString(result.transaction.amount_cents) },
        warnings: result.warnings,
      });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteTransaction(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
