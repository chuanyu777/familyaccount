import type { Db } from '../db/connection';
import { AppError, badRequest, notFound } from '../lib/httpError';

export interface MemberRow {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
}

function toMemberRow(raw: Record<string, unknown>): MemberRow {
  return {
    id: Number(raw.id),
    name: String(raw.name),
    color: raw.color === null ? null : String(raw.color),
    created_at: String(raw.created_at),
  };
}

export function listMembers(db: Db): MemberRow[] {
  const rows = db.prepare('SELECT id, name, color, created_at FROM member ORDER BY id').all() as Record<
    string,
    unknown
  >[];
  return rows.map(toMemberRow);
}

export function createMember(db: Db, input: { name: string; color?: string | null }): MemberRow {
  const name = input.name.trim();
  if (name === '') {
    throw badRequest('VALIDATION_FAILED', '成员名称不能为空');
  }
  const res = db
    .prepare('INSERT INTO member (name, color) VALUES (?, ?)')
    .run(name, input.color ?? null);
  const id = Number(res.lastInsertRowid);
  const row = db
    .prepare('SELECT id, name, color, created_at FROM member WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return toMemberRow(row);
}

export function updateMember(
  db: Db,
  id: number,
  patch: { name?: string; color?: string | null }
): MemberRow {
  const existing = db.prepare('SELECT id FROM member WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('MEMBER_NOT_FOUND', '成员不存在');
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name === '') {
      throw badRequest('VALIDATION_FAILED', '成员名称不能为空');
    }
    db.prepare('UPDATE member SET name = ? WHERE id = ?').run(name, id);
  }
  if (patch.color !== undefined) {
    db.prepare('UPDATE member SET color = ? WHERE id = ?').run(patch.color ?? null, id);
  }
  const row = db
    .prepare('SELECT id, name, color, created_at FROM member WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return toMemberRow(row);
}

export function deleteMember(db: Db, id: number): void {
  const existing = db.prepare('SELECT id FROM member WHERE id = ?').get(id);
  if (!existing) {
    throw notFound('MEMBER_NOT_FOUND', '成员不存在');
  }
  db.prepare('DELETE FROM member WHERE id = ?').run(id);
}
