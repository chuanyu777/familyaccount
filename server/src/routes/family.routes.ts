import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';

/** /api/family —— 单家庭读写。HTTP 层只做校验与装配，业务规则在 service/seed 内。 */
export function familyRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      ensureSeeded(db);
      const row = db
        .prepare('SELECT id, name FROM family WHERE id = ?')
        .get(1) as { id: number; name: string } | undefined;
      res.json({ id: row!.id, name: row!.name });
    } catch (e) {
      next(e);
    }
  });

  router.put('/', (req, res, next) => {
    try {
      const { name } = z
        .object({ name: z.string().trim().min(1, '名称不能为空') })
        .parse(req.body);
      ensureSeeded(db);
      db.prepare('UPDATE family SET name = ? WHERE id = ?').run(name, 1);
      const row = db
        .prepare('SELECT id, name FROM family WHERE id = ?')
        .get(1) as { id: number; name: string };
      res.json({ id: row.id, name: row.name });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
