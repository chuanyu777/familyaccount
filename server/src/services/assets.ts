import type { Db } from '../db/connection';
import { toCents, toYuanString } from '../domain/money';
import { currentMonth, isValidMonth } from '../domain/month';
import { badRequest, notFound } from '../lib/httpError';

export interface AssetRow {
  id: number;
  name: string;
  value_cents: number;
  kind: string;
  member_id: number | null;
  updated_at: string;
  updated_by_member_id: number | null;
}

export type AssetWithValue = AssetRow & { value: string };

export interface AssetGroup {
  key: string;
  label: string;
  totalCents: number;
  count: number;
}

/** 资产市值快照：一条 = 某项资产在某月底值多少钱。 */
export interface AssetSnapshotRow {
  id: number;
  asset_id: number;
  month: string;
  value_cents: number;
  note: string | null;
  recorded_at: string;
}

export type AssetSnapshot = AssetSnapshotRow & { value: string };

/** 指定月份的资产期末市值。source 说明数字来自快照还是回退到当前市值。 */
export interface AssetValueAtMonth {
  asset_id: number;
  cents: number;
  source: 'snapshot' | 'current';
}

const ASSET_COLS = 'id, name, value_cents, kind, member_id, updated_at, updated_by_member_id';

function toAssetRow(raw: Record<string, unknown>): AssetRow {
  return {
    id: Number(raw.id),
    name: String(raw.name),
    value_cents: Number(raw.value_cents),
    kind: String(raw.kind),
    member_id: raw.member_id === null ? null : Number(raw.member_id),
    updated_at: String(raw.updated_at),
    updated_by_member_id:
      raw.updated_by_member_id === null ? null : Number(raw.updated_by_member_id),
  };
}

function toAssetWithValue(row: AssetRow): AssetWithValue {
  return { ...row, value: toYuanString(row.value_cents) };
}

function assertMemberExists(db: Db, memberId: number): void {
  const row = db.prepare('SELECT id FROM member WHERE id = ?').get(memberId);
  if (!row) {
    throw notFound('MEMBER_NOT_FOUND', '成员不存在');
  }
}

/** 解析元输入为分；非法格式或负数统一抛 VALIDATION_FAILED 400。 */
function parseValueCents(value: number | string): number {
  let cents: number;
  try {
    cents = toCents(value);
  } catch {
    throw badRequest('VALIDATION_FAILED', '金额格式非法');
  }
  if (cents < 0) {
    throw badRequest('VALIDATION_FAILED', '当前市值不能为负');
  }
  return cents;
}

/* ------------------------------------------------------------------ *
 * 市值快照：资产项每月更新一次时，把当时的价值留在表里，供历史月份回看。
 * ------------------------------------------------------------------ */

function assertMonth(month: string): string {
  if (!isValidMonth(month)) {
    throw badRequest('VALIDATION_FAILED', '月份需为 YYYY-MM');
  }
  if (month > currentMonth()) {
    throw badRequest('FUTURE_MONTH', '不能记录未来月份的市值');
  }
  return month;
}

function toSnapshot(raw: Record<string, unknown>): AssetSnapshotRow {
  return {
    id: Number(raw.id),
    asset_id: Number(raw.asset_id),
    month: String(raw.month),
    value_cents: Number(raw.value_cents),
    note: raw.note === null || raw.note === undefined ? null : String(raw.note),
    recorded_at: String(raw.recorded_at),
  };
}

const SNAPSHOT_COLS = 'id, asset_id, month, value_cents, note, recorded_at';

/**
 * 记录（或覆盖）某项资产在某月底的市值。
 * 月份为当前月时，同步刷新 asset.value_cents——那就是最新市值；
 * 补录历史月份只写快照，不动当前市值。
 */
export function upsertAssetSnapshot(
  db: Db,
  assetId: number,
  input: { month: string; value: number | string; note?: string | null; updatedByMemberId?: number | null }
): AssetSnapshotRow {
  getAsset(db, assetId); // 不存在则抛 ASSET_NOT_FOUND
  const month = assertMonth(String(input.month ?? ''));
  const valueCents = parseValueCents(input.value);
  const note = input.note === undefined || input.note === null ? null : input.note.trim() || null;

  db.prepare(
    `INSERT INTO asset_snapshot (asset_id, month, value_cents, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (asset_id, month)
     DO UPDATE SET value_cents = excluded.value_cents,
                   note = excluded.note,
                   recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run(assetId, month, valueCents, note);

  if (month === currentMonth()) {
    db.prepare(
      `UPDATE asset
          SET value_cents = ?, updated_at = datetime('now'), updated_by_member_id = ?
        WHERE id = ?`
    ).run(valueCents, input.updatedByMemberId ?? null, assetId);
  }

  const row = db
    .prepare(`SELECT ${SNAPSHOT_COLS} FROM asset_snapshot WHERE asset_id = ? AND month = ?`)
    .get(assetId, month) as Record<string, unknown>;
  return toSnapshot(row);
}

/** 某项资产的市值历史，月份倒序。 */
export function listAssetSnapshots(db: Db, assetId: number): AssetSnapshot[] {
  getAsset(db, assetId);
  const rows = db
    .prepare(
      `SELECT ${SNAPSHOT_COLS} FROM asset_snapshot WHERE asset_id = ? ORDER BY month DESC, id DESC`
    )
    .all(assetId) as Record<string, unknown>[];
  return rows.map((r) => {
    const s = toSnapshot(r);
    return { ...s, value: toYuanString(s.value_cents) };
  });
}

/** 删除一条快照（填错历史值时用）。 */
export function deleteAssetSnapshot(db: Db, id: number): void {
  const row = db.prepare('SELECT id FROM asset_snapshot WHERE id = ?').get(id);
  if (!row) {
    throw notFound('SNAPSHOT_NOT_FOUND', '快照不存在');
  }
  db.prepare('DELETE FROM asset_snapshot WHERE id = ?').run(id);
}

/**
 * 各项资产在指定月份的期末市值。
 * 取「不晚于该月」的最近一条快照；完全没有历史记录时回退到当前市值（source='current'）。
 */
export function assetValuesAtMonth(db: Db, month: string): AssetValueAtMonth[] {
  const m = assertMonth(month);
  const assets = db.prepare('SELECT id, value_cents FROM asset ORDER BY id').all() as {
    id: number;
    value_cents: number;
  }[];
  const stmt = db.prepare(
    `SELECT value_cents FROM asset_snapshot
      WHERE asset_id = ? AND month <= ?
      ORDER BY month DESC, id DESC LIMIT 1`
  );
  return assets.map((a) => {
    const hit = stmt.get(a.id, m) as { value_cents: number } | undefined;
    if (hit) {
      return { asset_id: Number(a.id), cents: Number(hit.value_cents), source: 'snapshot' as const };
    }
    return { asset_id: Number(a.id), cents: Number(a.value_cents), source: 'current' as const };
  });
}

/** 指定月份资产市值合计（分）。 */
export function assetsTotalAtMonth(db: Db, month: string): number {
  return assetValuesAtMonth(db, month).reduce((s, a) => s + a.cents, 0);
}

export function listAssets(db: Db): AssetWithValue[] {
  const rows = db
    .prepare(`SELECT ${ASSET_COLS} FROM asset ORDER BY id`)
    .all() as Record<string, unknown>[];
  return rows.map((r) => toAssetWithValue(toAssetRow(r)));
}

export function getAsset(db: Db, id: number): AssetRow {
  const row = db
    .prepare(`SELECT ${ASSET_COLS} FROM asset WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('ASSET_NOT_FOUND', '资产项不存在');
  }
  return toAssetRow(row);
}

export function createAsset(
  db: Db,
  input: { name: string; value?: number | string; kind?: string; memberId?: number | null }
): AssetRow {
  const name = input.name.trim();
  if (name === '') {
    throw badRequest('VALIDATION_FAILED', '资产名称不能为空');
  }
  const valueCents = input.value === undefined ? 0 : parseValueCents(input.value);
  const kind = input.kind?.trim() || '其他';
  if (input.memberId != null) {
    assertMemberExists(db, input.memberId);
  }
  const res = db
    .prepare('INSERT INTO asset (name, value_cents, kind, member_id) VALUES (?, ?, ?, ?)')
    .run(name, valueCents, kind, input.memberId ?? null);
  const id = Number(res.lastInsertRowid);
  // 建项即记一条当月快照，历史月份从这一刻起有据可查。
  upsertAssetSnapshot(db, id, {
    month: currentMonth(),
    value: toYuanString(valueCents),
    note: '建项',
  });
  return getAsset(db, id);
}

export function updateAsset(
  db: Db,
  id: number,
  patch: {
    name?: string;
    value?: number | string;
    kind?: string;
    memberId?: number | null;
    updatedByMemberId?: number | null;
  }
): AssetRow {
  const existing = db.prepare('SELECT id FROM asset WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ASSET_NOT_FOUND', '资产项不存在');
  }
  if (patch.memberId != null) {
    assertMemberExists(db, patch.memberId);
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') {
      throw badRequest('VALIDATION_FAILED', '资产名称不能为空');
    }
    db.prepare('UPDATE asset SET name = ? WHERE id = ?').run(name, id);
  }
  if (patch.kind !== undefined) {
    const kind = patch.kind.trim() || '其他';
    db.prepare('UPDATE asset SET kind = ? WHERE id = ?').run(kind, id);
  }
  if (patch.memberId !== undefined) {
    db.prepare('UPDATE asset SET member_id = ? WHERE id = ?').run(patch.memberId ?? null, id);
  }
  if (patch.value !== undefined) {
    const valueCents = parseValueCents(patch.value);
    db.prepare(
      `UPDATE asset
         SET value_cents = ?,
             updated_at = datetime('now'),
             updated_by_member_id = ?
       WHERE id = ?`
    ).run(valueCents, patch.updatedByMemberId ?? null, id);
    upsertAssetSnapshot(db, id, {
      month: currentMonth(),
      value: patch.value,
      updatedByMemberId: patch.updatedByMemberId ?? null,
    });
  }
  return getAsset(db, id);
}

export function deleteAsset(db: Db, id: number): void {
  const existing = db.prepare('SELECT id FROM asset WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('ASSET_NOT_FOUND', '资产项不存在');
  }
  db.prepare('DELETE FROM asset WHERE id = ?').run(id);
}

/**
 * 按成员或类型汇总资产市值。
 * by='member'：member_id 为 NULL 的归入 key='family'、label='家庭共有'。
 */
export function groupAssets(db: Db, by: 'member' | 'kind'): AssetGroup[] {
  if (by === 'kind') {
    const rows = db
      .prepare(
        `SELECT kind AS k, COALESCE(SUM(value_cents), 0) AS t, COUNT(*) AS c
           FROM asset GROUP BY kind ORDER BY kind`
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      key: String(r.k),
      label: String(r.k),
      totalCents: Number(r.t),
      count: Number(r.c),
    }));
  }

  const rows = db
    .prepare(
      `SELECT a.member_id AS mid, m.name AS mname,
              COALESCE(SUM(a.value_cents), 0) AS t, COUNT(*) AS c
         FROM asset a LEFT JOIN member m ON m.id = a.member_id
        GROUP BY a.member_id
        ORDER BY CASE WHEN a.member_id IS NULL THEN 0 ELSE 1 END, m.name`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => {
    const mid = r.mid === null ? null : Number(r.mid);
    if (mid === null) {
      return { key: 'family', label: '家庭共有', totalCents: Number(r.t), count: Number(r.c) };
    }
    return {
      key: String(mid),
      label: String(r.mname),
      totalCents: Number(r.t),
      count: Number(r.c),
    };
  });
}
