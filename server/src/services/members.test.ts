import { describe, it, expect } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { listMembers, createMember, updateMember, deleteMember } from './members';
import type { MemberRow } from './members';

describe('members', () => {
  describe('createMember', () => {
    it('创建成员后返回带 id 的行', () => {
      const db: Db = createTestDb();
      const m = createMember(db, { name: 'Alice' });
      expect(m.id).toBeGreaterThan(0);
      expect(m.name).toBe('Alice');
    });

    it('name 首尾空白被去掉', () => {
      const db: Db = createTestDb();
      const m = createMember(db, { name: '  Bob  ' });
      expect(m.name).toBe('Bob');
    });

    it('name 去掉首尾空白后为空则抛 VALIDATION_FAILED', () => {
      const db: Db = createTestDb();
      expect(() => createMember(db, { name: '   ' })).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' })
      );
    });
  });

  describe('listMembers', () => {
    it('返回所有成员行数组', () => {
      const db: Db = createTestDb();
      createMember(db, { name: 'A' });
      createMember(db, { name: 'B' });
      const rows: MemberRow[] = listMembers(db);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(2);
    });
  });

  describe('updateMember', () => {
    it('改名后返回新名称', () => {
      const db: Db = createTestDb();
      const m = createMember(db, { name: 'Old' });
      const updated = updateMember(db, m.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('不存在的成员抛 MEMBER_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => updateMember(db, 999, { name: 'X' })).toThrowError(
        expect.objectContaining({ code: 'MEMBER_NOT_FOUND' })
      );
    });
  });

  describe('deleteMember', () => {
    it('不存在的成员抛 MEMBER_NOT_FOUND', () => {
      const db: Db = createTestDb();
      expect(() => deleteMember(db, 999)).toThrowError(
        expect.objectContaining({ code: 'MEMBER_NOT_FOUND' })
      );
    });

    it('删除成员后，归属其的账户仍然存在且 member_id 置 NULL', () => {
      const db: Db = createTestDb();
      const m = createMember(db, { name: 'Owner' });
      db.prepare('INSERT INTO account (name, balance_cents, member_id) VALUES (?, ?, ?)').run(
        '专属账户',
        0,
        m.id
      );
      expect(() => deleteMember(db, m.id)).not.toThrow();
      const acc = db
        .prepare('SELECT id, member_id FROM account WHERE name = ?')
        .get('专属账户') as { id: number; member_id: number | null };
      expect(acc).toBeTruthy();
      expect(acc.member_id).toBeNull();
      // 成员已删除
      const after = db.prepare('SELECT id FROM member WHERE id = ?').get(m.id);
      expect(after).toBeUndefined();
    });
  });
});
