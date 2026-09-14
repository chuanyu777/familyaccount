import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { listCategories, upsertCategory } from '../services/categories';

/** /api/categories —— 仅做参数校验、调用 service、错误映射。 */
export function categoryRoutes(db: Db): Router {
  const router = Router();

  const kindSchema = z.enum(['expense', 'income']);

  router.get('/', (req, res, next) => {
    try {
      const kind = kindSchema.parse(req.query.kind);
      res.json(listCategories(db, kind));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const { kind, name } = z
        .object({
          kind: kindSchema,
          name: z.string().trim().min(1, '分类名称不能为空'),
        })
        .parse(req.body);
      res.json(upsertCategory(db, { kind, name }));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
