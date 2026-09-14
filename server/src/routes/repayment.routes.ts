import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { listRepayments, createRepayment, deleteRepayment } from '../services/repayments';
import { parseIdParam } from './params';
import { badRequest } from '../lib/httpError';

/** /api/repayments —— 仅做参数校验、金额转换交给 service、错误映射。 */
export function repaymentRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const raw = req.query.liabilityId;
      let liabilityId: number | undefined;
      if (raw !== undefined && raw !== '') {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) {
          throw badRequest('VALIDATION_FAILED', 'liabilityId 必须为正整数');
        }
        liabilityId = n;
      }
      res.json(listRepayments(db, liabilityId));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = z
        .object({
          liabilityId: z.number().int().positive(),
          amount: z.union([z.string(), z.number()]).optional(),
          occurredOn: z.string().optional(),
          accountId: z.number().int().positive().optional(),
          memberId: z.number().int().positive().nullable().optional(),
          note: z.string().nullable().optional(),
        })
        .parse(req.body);
      const result = createRepayment(db, body);
      res.status(201).json(result.repayment);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteRepayment(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
