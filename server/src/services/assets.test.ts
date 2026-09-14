import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/connection';
import type { Db } from '../db/connection';
import { ensureSeeded } from '../db/seed';
import { getDefaultAccount } from '../db/seed';
import { createMember } from './members';
import { AppError } from '../lib/httpError';
import {
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  groupAssets,
  upsertAssetSnapshot,
  listAssetSnapshots,
  deleteAssetSnapshot,
  assetValuesAtMonth,
  assetsTotalAtMonth,
} from './assets';
import { currentMonth, shiftMonth } from '../domain/month';

function assertAppError(
  fn: () => unknown,
  code: string,
  status: number
): void {
  try {
    fn();
    throw new Error('expected to throw');
  } catch (e) {
    if (e instanceof Error && e.message === 'expected to throw') throw e;
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    expect((e as AppError).status).toBe(status);
  }
}

describe('assets service', () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
  });

  it('listAssets 初始为空数组', () => {
    expect(listAssets(db)).toEqual([]);
  });

  it('createAsset 默认市值 0、类型「其他」、归属家庭共有(NULL)', () => {
    const row = createAsset(db, { name: '房子' });
    expect(row.name).toBe('房子');
    expect(row.value_cents).toBe(0);
    expect(row.kind).toBe('其他');
    expect(row.member_id).toBeNull();
  });

  it('createAsset 接受数字/数字字符串元，转分为 value_cents', () => {
    const a = createAsset(db, { name: 'A', value: '99.99' });
    expect(a.value_cents).toBe(9999);
    const b = createAsset(db, { name: 'B', value: 12.5 });
    expect(b.value_cents).toBe(1250);
  });

  it('listAssets 返回 value 元字符串', () => {
    createAsset(db, { name: 'A', value: '12.34' });
    const list = listAssets(db);
    expect(list).toHaveLength(1);
    expect(list[0]!.value).toBe('12.34');
    expect(list[0]!.value_cents).toBe(1234);
  });

  it('createAsset 空名称抛 VALIDATION_FAILED 400', () => {
    assertAppError(() => createAsset(db, { name: '   ' }), 'VALIDATION_FAILED', 400);
  });

  it('createAsset 负市值抛 VALIDATION_FAILED 400', () => {
    assertAppError(() => createAsset(db, { name: 'A', value: -5 }), 'VALIDATION_FAILED', 400);
  });

  it('createAsset 非法金额格式抛 VALIDATION_FAILED 400', () => {
    assertAppError(() => createAsset(db, { name: 'A', value: 'abc' }), 'VALIDATION_FAILED', 400);
  });

  it('createAsset 可指定类型', () => {
    const row = createAsset(db, { name: 'A', kind: '房产' });
    expect(row.kind).toBe('房产');
  });

  it('createAsset 空 kind 回落「其他」', () => {
    const row = createAsset(db, { name: 'A', kind: '   ' });
    expect(row.kind).toBe('其他');
  });

  it('createAsset 关联成员并落 member_id', () => {
    const m = createMember(db, { name: 'M' });
    const row = createAsset(db, { name: 'A', memberId: m.id });
    expect(row.member_id).toBe(m.id);
  });

  it('createAsset 关联不存在成员抛 MEMBER_NOT_FOUND 404', () => {
    assertAppError(() => createAsset(db, { name: 'A', memberId: 999 }), 'MEMBER_NOT_FOUND', 404);
  });

  it('getAsset 不存在抛 ASSET_NOT_FOUND 404', () => {
    assertAppError(() => getAsset(db, 999), 'ASSET_NOT_FOUND', 404);
  });

  it('updateAsset 传入 value 刷新 updated_at 与 updated_by_member_id', () => {
    const m = createMember(db, { name: 'M' });
    const created = createAsset(db, { name: 'A' });
    const before = getAsset(db, created.id);
    expect(before.updated_by_member_id).toBeNull();

    const updated = updateAsset(db, created.id, {
      value: '50.00',
      updatedByMemberId: m.id,
    });
    expect(updated.value_cents).toBe(5000);
    expect(updated.updated_by_member_id).toBe(m.id);
    expect(updated.updated_at >= before.updated_at).toBe(true);
  });

  it('updateAsset 仅改 name 不刷新 updated_at/updated_by_member_id', () => {
    const created = createAsset(db, { name: 'A' });
    const before = getAsset(db, created.id);
    const updated = updateAsset(db, created.id, { name: 'B' });
    expect(updated.name).toBe('B');
    expect(updated.updated_at).toBe(before.updated_at);
    expect(updated.updated_by_member_id).toBeNull();
  });

  it('updateAsset 改归属为成员或家庭共有', () => {
    const m = createMember(db, { name: 'M' });
    const created = createAsset(db, { name: 'A' });
    const toMember = updateAsset(db, created.id, { memberId: m.id });
    expect(toMember.member_id).toBe(m.id);
    const toFamily = updateAsset(db, created.id, { memberId: null });
    expect(toFamily.member_id).toBeNull();
  });

  it('updateAsset 负市值抛 VALIDATION_FAILED 400', () => {
    const created = createAsset(db, { name: 'A' });
    assertAppError(
      () => updateAsset(db, created.id, { value: -1 }),
      'VALIDATION_FAILED',
      400
    );
  });

  it('updateAsset 不存在抛 ASSET_NOT_FOUND 404', () => {
    assertAppError(() => updateAsset(db, 999, { name: 'x' }), 'ASSET_NOT_FOUND', 404);
  });

  it('deleteAsset 删除后列表减少', () => {
    const a = createAsset(db, { name: 'A' });
    expect(listAssets(db)).toHaveLength(1);
    deleteAsset(db, a.id);
    expect(listAssets(db)).toHaveLength(0);
  });

  it('deleteAsset 不存在抛 ASSET_NOT_FOUND 404', () => {
    assertAppError(() => deleteAsset(db, 999), 'ASSET_NOT_FOUND', 404);
  });

  it('groupAssets by kind 按类型汇总', () => {
    createAsset(db, { name: '房1', kind: '房产', value: '100.00' });
    createAsset(db, { name: '房2', kind: '房产', value: '50.00' });
    createAsset(db, { name: '车', kind: '车辆', value: '30.00' });
    const groups = groupAssets(db, 'kind');
    const house = groups.find((g) => g.key === '房产');
    const car = groups.find((g) => g.key === '车辆');
    expect(house).toMatchObject({ label: '房产', totalCents: 15000, count: 2 });
    expect(car).toMatchObject({ label: '车辆', totalCents: 3000, count: 1 });
  });

  it('groupAssets by member 将 NULL 归属归入「家庭共有」', () => {
    const m = createMember(db, { name: 'M' });
    createAsset(db, { name: '家产', value: '100.00' });
    createAsset(db, { name: 'M产1', memberId: m.id, value: '40.00' });
    createAsset(db, { name: 'M产2', memberId: m.id, value: '10.00' });
    const groups = groupAssets(db, 'member');
    const family = groups.find((g) => g.key === 'family');
    const member = groups.find((g) => g.key === String(m.id));
    expect(family).toMatchObject({ label: '家庭共有', totalCents: 10000, count: 1 });
    expect(member).toMatchObject({ label: 'M', totalCents: 5000, count: 2 });
  });

  it('规则3：建立资产项不影响默认账户余额', () => {
    const before = getDefaultAccount(db);
    expect(before?.balance_cents).toBe(0);
    createAsset(db, { name: 'A', value: '9999.99' });
    const after = getDefaultAccount(db);
    expect(after?.balance_cents).toBe(0);
  });
});

describe('资产市值快照', () => {
  let db: Db;
  const M = currentMonth();
  const PREV = shiftMonth(M, -1);
  const PREV2 = shiftMonth(M, -2);

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
  });

  it('建项自动生成当月快照', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    const snaps = listAssetSnapshots(db, a.id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ month: M, value_cents: 10000, value: '100.00' });
  });

  it('更新当前月市值会同步 asset.value_cents', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: M, value: '120.50' });
    expect(getAsset(db, a.id).value_cents).toBe(12050);
    expect(listAssetSnapshots(db, a.id)).toHaveLength(1);
  });

  it('同月重复记录是覆盖而非新增', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: M, value: '110.00' });
    upsertAssetSnapshot(db, a.id, { month: M, value: '130.00' });
    const snaps = listAssetSnapshots(db, a.id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.value_cents).toBe(13000);
  });

  it('补录历史月份只写快照，不动当前市值', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: PREV, value: '80.00' });
    expect(getAsset(db, a.id).value_cents).toBe(10000);
    expect(listAssetSnapshots(db, a.id).map((s) => s.month)).toEqual([M, PREV]);
  });

  it('未来月份拒绝记录（FUTURE_MONTH 400）', () => {
    const a = createAsset(db, { name: '股票', value: '10.00' });
    assertAppError(
      () => upsertAssetSnapshot(db, a.id, { month: shiftMonth(M, 1), value: '1.00' }),
      'FUTURE_MONTH',
      400
    );
  });

  it('月份格式非法 / 金额为负 / 资产不存在分别报错', () => {
    const a = createAsset(db, { name: '股票', value: '10.00' });
    assertAppError(() => upsertAssetSnapshot(db, a.id, { month: '2026-13', value: '1' }), 'VALIDATION_FAILED', 400);
    assertAppError(() => upsertAssetSnapshot(db, a.id, { month: M, value: '-1' }), 'VALIDATION_FAILED', 400);
    assertAppError(() => upsertAssetSnapshot(db, 9999, { month: M, value: '1' }), 'ASSET_NOT_FOUND', 404);
  });

  it('assetValuesAtMonth 取不晚于该月的最近一条快照', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: PREV2, value: '60.00' });
    upsertAssetSnapshot(db, a.id, { month: PREV, value: '80.00' });
    expect(assetValuesAtMonth(db, PREV2)).toEqual([{ asset_id: a.id, cents: 6000, source: 'snapshot' }]);
    expect(assetValuesAtMonth(db, PREV)).toEqual([{ asset_id: a.id, cents: 8000, source: 'snapshot' }]);
    expect(assetValuesAtMonth(db, M)).toEqual([{ asset_id: a.id, cents: 10000, source: 'snapshot' }]);
  });

  it('更早的月份没有任何快照时回退到当前市值（source=current）', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    const early = shiftMonth(M, -24);
    expect(assetValuesAtMonth(db, early)).toEqual([
      { asset_id: a.id, cents: 10000, source: 'current' },
    ]);
  });

  it('assetsTotalAtMonth 汇总该月各项市值', () => {
    createAsset(db, { name: '股票', value: '100.00' });
    createAsset(db, { name: '基金', value: '50.00' });
    upsertAssetSnapshot(db, 1, { month: PREV, value: '90.00' });
    upsertAssetSnapshot(db, 2, { month: PREV, value: '40.00' });
    expect(assetsTotalAtMonth(db, PREV)).toBe(13000);
    expect(assetsTotalAtMonth(db, M)).toBe(15000);
  });

  it('deleteAssetSnapshot 删除指定快照，不存在时 404', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: PREV, value: '80.00' });
    const target = listAssetSnapshots(db, a.id).find((s) => s.month === PREV);
    deleteAssetSnapshot(db, target!.id);
    expect(listAssetSnapshots(db, a.id).map((s) => s.month)).toEqual([M]);
    assertAppError(() => deleteAssetSnapshot(db, target!.id), 'SNAPSHOT_NOT_FOUND', 404);
  });

  it('删除资产项时其快照一并清掉', () => {
    const a = createAsset(db, { name: '股票', value: '100.00' });
    upsertAssetSnapshot(db, a.id, { month: PREV, value: '80.00' });
    deleteAsset(db, a.id);
    const rows = db.prepare('SELECT id FROM asset_snapshot').all();
    expect(rows).toHaveLength(0);
  });
});
