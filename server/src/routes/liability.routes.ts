import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import {
  listLiabilities,
  getLiability,
  createLiability,
  updateLiability,
  deleteLiability,
} from '../services/liabilities';
import { parseIdParam } from './params';
import { badRequest } from '../lib/httpError';

/** /api/liabilities —— 仅做参数校验、金额转换交给 service、错误映射。 */
export function liabilityRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(listLiabilities(db));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(1, '名称不能为空'),
          remaining: z.union([z.string(), z.number()]),
          monthlyPayment: z.union([z.string(), z.number()]).optional(),
          paymentDay: z.number().int().min(1).max(31).nullable().optional(),
          memberId: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      const row = createLiability(db, {
        name: body.name,
        remaining: body.remaining,
        monthlyPayment: body.monthlyPayment,
        paymentDay: body.paymentDay,
        memberId: body.memberId,
      });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const patch = z
        .object({
          name: z.string().trim().min(1).optional(),
          remaining: z.union([z.string(), z.number()]).optional(),
          monthlyPayment: z.union([z.string(), z.number()]).optional(),
          paymentDay: z.number().int().min(1).max(31).nullable().optional(),
          memberId: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      res.json(updateLiability(db, id, patch));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteLiability(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
