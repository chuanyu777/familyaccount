import type { Db } from './connection';

export interface AccountRow {
  id: number;
  name: string;
  balance_cents: number;
  member_id: number | null;
  is_default: number;
  created_at: string;
}

/** 仅当 family 表没有行时插入初始数据，保证幂等。 */
export function ensureSeeded(db: Db): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM family').get() as { n: number };
  if (row.n > 0) return;

  db.prepare('INSERT INTO family (id, name) VALUES (?, ?)').run(1, '我的家');
  db.prepare('INSERT INTO member (name) VALUES (?)').run('我');
  db.prepare(
    'INSERT INTO account (name, balance_cents, is_default) VALUES (?, ?, ?)'
  ).run('默认账户', 0, 1);
  db.prepare('INSERT INTO category (kind, name) VALUES (?, ?)').run('expense', '其他');
  db.prepare('INSERT INTO category (kind, name) VALUES (?, ?)').run('income', '其他收入');
}

/** 返回 is_default=1 的账户行（不存在时返回 undefined）。 */
export function getDefaultAccount(db: Db): AccountRow | undefined {
  return db
    .prepare('SELECT id, name, balance_cents, member_id, is_default, created_at FROM account WHERE is_default = 1')
    .get() as AccountRow | undefined;
}
