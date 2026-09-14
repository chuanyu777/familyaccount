import type { Db } from '../db/connection';
import { badRequest } from '../lib/httpError';

export type CategoryKind = 'expense' | 'income';

export interface CategoryRow {
  id: number;
  kind: CategoryKind;
  name: string;
  created_at: string;
}

const SELECT_COLS = 'id, kind, name, created_at';

function toCategoryRow(raw: Record<string, unknown>): CategoryRow {
  return {
    id: Number(raw.id),
    kind: String(raw.kind) as CategoryKind,
    name: String(raw.name),
    created_at: String(raw.created_at),
  };
}

export function listCategories(db: Db, kind: CategoryKind): CategoryRow[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM category WHERE kind = ? ORDER BY id`)
    .all(kind) as Record<string, unknown>[];
  return rows.map(toCategoryRow);
}

export function upsertCategory(
  db: Db,
  input: { kind: CategoryKind; name: string }
): CategoryRow {
  const name = input.name.trim();
  if (name === '') {
    throw badRequest('VALIDATION_FAILED', '分类名称不能为空');
  }
  const existing = db
    .prepare('SELECT id, kind, name, created_at FROM category WHERE kind = ? AND name = ?')
    .get(input.kind, name) as Record<string, unknown> | undefined;
  if (existing) {
    return toCategoryRow(existing);
  }
  const res = db
    .prepare('INSERT INTO category (kind, name) VALUES (?, ?)')
    .run(input.kind, name);
  const id = Number(res.lastInsertRowid);
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM category WHERE id = ?`)
    .get(id) as Record<string, unknown>;
  return toCategoryRow(row);
}

export function ensureDefaultCategory(db: Db, kind: CategoryKind): CategoryRow {
  const defaultName = kind === 'expense' ? '其他' : '其他收入';
  return upsertCategory(db, { kind, name: defaultName });
}
