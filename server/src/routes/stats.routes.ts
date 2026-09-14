import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { summary, monthlyTrend, categoryBreakdown, monthSnapshot } from '../services/stats';
import { MONTH_RE } from '../domain/month';

/** /api/stats —— 仅做 query 校验并调用 service，无业务逻辑。 */
export function statsRoutes(db: Db): Router {
  const router = Router();

  router.get('/summary', (_req, res, next) => {
    try {
      res.json(summary(db));
    } catch (e) {
      next(e);
    }
  });

  router.get('/monthly-trend', (req, res, next) => {
    try {
      const months = z.coerce
        .number()
        .int()
        .min(1)
        .max(24)
        .default(6)
        .parse(req.query.months ?? undefined);
      const end = z
        .string()
        .regex(MONTH_RE, 'end 需为 YYYY-MM')
        .optional()
        .parse(req.query.end ?? undefined);
      res.json(monthlyTrend(db, months, end));
    } catch (e) {
      next(e);
    }
  });

  /** 指定月份的月末截面：收支 + 资产负债净资产 + 支出分类占比，一屏数据一次拿完。 */
  router.get('/monthly-snapshot', (req, res, next) => {
    try {
      const month = z
        .string()
        .regex(MONTH_RE, 'month 需为 YYYY-MM')
        .optional()
        .parse(req.query.month ?? undefined);
      res.json(monthSnapshot(db, month));
    } catch (e) {
      next(e);
    }
  });

  router.get('/category-breakdown', (req, res, next) => {
    try {
      const month = z
        .string()
        .regex(MONTH_RE, 'month 需为 YYYY-MM')
        .optional()
        .parse(req.query.month ?? undefined);
      res.json(categoryBreakdown(db, month));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
