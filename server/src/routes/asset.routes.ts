import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/connection';
import {
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  upsertAssetSnapshot,
  listAssetSnapshots,
  deleteAssetSnapshot,
} from '../services/assets';
import { parseIdParam } from './params';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** /api/assets —— 仅做参数校验、金额转换、调用 service、错误映射。 */
export function assetRoutes(db: Db): Router {
  const router = Router();

  router.get('/', (_req, res, next) => {
    try {
      res.json(listAssets(db));
    } catch (e) {
      next(e);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(1, '资产名称不能为空'),
          value: z.union([z.string(), z.number()]).optional(),
          kind: z.string().trim().optional(),
          memberId: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      const row = createAsset(db, {
        name: body.name,
        value: body.value,
        kind: body.kind,
        memberId: body.memberId ?? undefined,
      });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const body = z
        .object({
          name: z.string().trim().min(1, '资产名称不能为空').optional(),
          value: z.union([z.string(), z.number()]).optional(),
          kind: z.string().trim().optional(),
          memberId: z.number().int().nullable().optional(),
          updatedByMemberId: z.number().int().nullable().optional(),
        })
        .parse(req.body);
      const row = updateAsset(db, id, {
        name: body.name,
        value: body.value,
        kind: body.kind,
        memberId: body.memberId,
        updatedByMemberId: body.updatedByMemberId ?? undefined,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  /** 市值历史，月份倒序 */
  router.get('/:id/snapshots', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      res.json(listAssetSnapshots(db, id));
    } catch (e) {
      next(e);
    }
  });

  /** 记录/覆盖某月市值。月份为当前月时同步刷新该项的当前市值。 */
  router.post('/:id/snapshots', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      const body = z
        .object({
          month: z.string().regex(MONTH_RE, 'month 需为 YYYY-MM'),
          value: z.union([z.string(), z.number()]),
          note: z.string().trim().max(100).nullable().optional(),
          updatedByMemberId: z.number().int().nullable().optional(),
        })
        .parse(req.body);
      const row = upsertAssetSnapshot(db, id, {
        month: body.month,
        value: body.value,
        note: body.note ?? null,
        updatedByMemberId: body.updatedByMemberId ?? null,
      });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  /** 删掉一条填错的历史快照。必须排在 /:id 之前，否则会被当成 id='snapshots'。 */
  router.delete('/snapshots/:snapshotId', (req, res, next) => {
    try {
      const snapshotId = parseIdParam(req.params.snapshotId);
      deleteAssetSnapshot(db, snapshotId);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseIdParam(req.params.id);
      deleteAsset(db, id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
