import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount,
  calibrateBalance,
  getAccount,
} from '../services/accounts';
import { parseIdParam } from './params';
import { toCents } from '../domain/money';
import { badRequest } from '../lib/httpError';

/** /api/accounts —— 仅做参数校验、金额转换、调用 service、错误映射。 */
export function accountRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(listAccounts(db));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const { name, memberId } = z
        .object({
          name: z.string().trim().min(1, '名称不能为空'),
          memberId: z.number().int().positive().optional(),
        })
        .parse(req.body);
      const row = createAccount(db, { name, memberId: memberId ?? undefined });
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
          name: z.string().trim().min(1, '名称不能为空').optional(),
          memberId: z.number().int().optional().nullable(),
        })
        .parse(req.body);
      res.json(updateAccount(db, id, patch));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteAccount(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/set-default', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      setDefaultAccount(db, id);
      res.json(getAccount(db, id));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id/calibrate', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const { balance } = z
        .object({ balance: z.union([z.string(), z.number()]) })
        .parse(req.body);
      let cents: number;
      try {
        cents = toCents(balance);
      } catch {
        throw badRequest('VALIDATION_FAILED', '金额格式非法');
      }
      res.json(calibrateBalance(db, id, cents));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
