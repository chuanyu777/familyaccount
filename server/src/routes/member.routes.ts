import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { listMembers, createMember, updateMember, deleteMember } from '../services/members';
import { parseIdParam } from './params';

/** /api/members —— 仅做参数校验、调用 service、错误映射，不含业务规则。 */
export function memberRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(listMembers(db));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const { name, color } = z
        .object({
          name: z.string().trim().min(1, '名称不能为空'),
          color: z.string().nullable().optional(),
        })
        .parse(req.body);
      const row = createMember(db, { name, color: color ?? undefined });
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
          color: z.string().nullable().optional(),
        })
        .parse(req.body);
      res.json(updateMember(db, id, patch));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteMember(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
