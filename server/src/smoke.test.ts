import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb, type Db } from './db/connection';
import { ensureSeeded } from './db/seed';
import { createApp } from './app';

/**
 * 全链路冒烟：按 US-01 → US-09 的顺序走一遍真实业务流程，
 * 断言每一步的派生数据。这里不做单元测试式的细枝末节，
 * 只回答一个问题：用户真的能把账记对吗？
 */
describe('全链路冒烟 US-01 → US-09', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    ensureSeeded(db);
    app = createApp(db);
  });

  it('从初始化到净资产统计的完整闭环', async () => {
    // ---------- US-01 零配置初始化 ----------
    const family = await request(app).get('/api/family').expect(200);
    expect(family.body.name).toBe('我的家');

    const members = await request(app).get('/api/members').expect(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0].name).toBe('我');
    const meId = members.body[0].id;

    const accounts0 = await request(app).get('/api/accounts').expect(200);
    expect(accounts0.body).toHaveLength(1);
    expect(accounts0.body[0].name).toBe('默认账户');
    expect(accounts0.body[0].is_default).toBe(1);
    const defaultAccountId = accounts0.body[0].id;

    // ---------- US-02 账户管理 ----------
    const salary = await request(app)
      .post('/api/accounts')
      .send({ name: '工资卡' })
      .expect(201);
    const salaryId = salary.body.id;

    // ---------- US-03 记账：支出 / 收入 / 转账 ----------
    await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: 100, categoryName: '餐饮' })
      .expect(201);

    await request(app)
      .post('/api/transactions')
      .send({ type: 'income', amount: 5000, categoryName: '工资' })
      .expect(201);

    // US-04 内联新建的分类已生效
    const cats = await request(app).get('/api/categories?kind=expense').expect(200);
    expect(cats.body.map((c: { name: string }) => c.name)).toContain('餐饮');

    // 转账：不计入收支
    await request(app)
      .post('/api/transactions')
      .send({ type: 'transfer', amount: 900, toAccountId: salaryId })
      .expect(201);

    let accounts = await request(app).get('/api/accounts').expect(200);
    const byId = (id: number) => accounts.body.find((a: { id: number }) => a.id === id);
    // 默认账户：-100 + 5000 - 900 = 4000
    expect(byId(defaultAccountId).balance_cents).toBe(400000);
    // 工资卡：+900
    expect(byId(salaryId).balance_cents).toBe(90000);

    // ---------- US-05 查账与统计口径 ----------
    const list = await request(app).get('/api/transactions').expect(200);
    expect(list.body.total).toBe(3);
    expect(list.body.incomeTotalCents).toBe(500000);
    expect(list.body.expenseTotalCents).toBe(10000);
    expect(list.body.netCents).toBe(490000);
    // 转账不该出现在收支合计里（上面两个数字已排除它）
    const transfer = list.body.items.find((t: { type: string }) => t.type === 'transfer');
    expect(transfer).toBeTruthy();

    // ---------- US-06 资产 ----------
    await request(app)
      .post('/api/assets')
      .send({ name: '自住房', value: 1000000, kind: '房产', memberId: meId })
      .expect(201);

    // ---------- US-07 负债 ----------
    const loan = await request(app)
      .post('/api/liabilities')
      .send({ name: '房贷', remaining: 800000, monthlyPayment: 5000, paymentDay: 20 })
      .expect(201);
    const loanId = loan.body.id;

    // ---------- US-08 还款：四步联动 ----------
    const repay = await request(app)
      .post('/api/repayments')
      .send({ liabilityId: loanId, amount: 5000 })
      .expect(201);

    let liabs = await request(app).get('/api/liabilities').expect(200);
    expect(liabs.body.find((l: { id: number }) => l.id === loanId).remaining_cents).toBe(79500000);

    accounts = await request(app).get('/api/accounts').expect(200);
    // 默认账户再减 5000：4000 - 5000 = -1000（允许负余额并告警）
    expect(byId(defaultAccountId).balance_cents).toBe(-100000);

    // 还款生成的支出出现在账目里，且带还款标记
    const afterRepay = await request(app).get('/api/transactions').expect(200);
    const generated = afterRepay.body.items.find(
      (t: { sourceType: string }) => t.sourceType === 'repayment',
    );
    expect(generated).toBeTruthy();
    expect(generated.amountCents).toBe(500000);
    // 还款支出计入支出统计：100 + 5000 = 5100
    expect(afterRepay.body.expenseTotalCents).toBe(510000);

    // 还款生成的支出不能直接删
    await request(app).delete(`/api/transactions/${generated.id}`).expect(409);

    // ---------- US-09 净资产与图表 ----------
    let stats = await request(app).get('/api/stats/summary').expect(200);
    // 资产 = 账户(-1000 + 900 分? 注意单位) → 见下方断言
    const accountsCents = accounts.body.reduce(
      (s: number, a: { balance_cents: number }) => s + a.balance_cents,
      0,
    );
    expect(stats.body.accountsTotalCents).toBe(accountsCents);
    expect(stats.body.assetsTotalCents).toBe(100000000);
    expect(stats.body.totalAssetsCents).toBe(accountsCents + 100000000);
    expect(stats.body.totalLiabilitiesCents).toBe(79500000);
    expect(stats.body.netWorthCents).toBe(accountsCents + 100000000 - 79500000);
    expect(stats.body.monthlyPaymentTotalCents).toBe(500000);

    const trend = await request(app).get('/api/stats/monthly-trend?months=6').expect(200);
    expect(trend.body).toHaveLength(6);
    const thisMonth = trend.body[trend.body.length - 1];
    expect(thisMonth.incomeCents).toBe(500000);
    expect(thisMonth.expenseCents).toBe(510000);

    const breakdown = await request(app).get('/api/stats/category-breakdown').expect(200);
    // 还款支出挂在默认分类「其他」，应出现在占比里
    expect(breakdown.body.some((c: { name: string }) => c.name === '其他')).toBe(true);
    const percentSum = breakdown.body.reduce(
      (s: number, c: { percent: number }) => s + c.percent,
      0,
    );
    expect(Math.abs(percentSum - 100)).toBeLessThan(0.01);

    // ---------- 删除还款：完整回滚 ----------
    await request(app).delete(`/api/repayments/${repay.body.id}`).expect(200);

    liabs = await request(app).get('/api/liabilities').expect(200);
    expect(liabs.body.find((l: { id: number }) => l.id === loanId).remaining_cents).toBe(80000000);

    accounts = await request(app).get('/api/accounts').expect(200);
    expect(byId(defaultAccountId).balance_cents).toBe(400000);

    const afterDelete = await request(app).get('/api/transactions').expect(200);
    expect(
      afterDelete.body.items.filter((t: { sourceType: string }) => t.sourceType === 'repayment'),
    ).toHaveLength(0);
    expect(afterDelete.body.expenseTotalCents).toBe(10000);

    // ---------- 删除负债：级联清理 ----------
    await request(app)
      .post('/api/repayments')
      .send({ liabilityId: loanId, amount: 5000 })
      .expect(201);
    await request(app).delete(`/api/liabilities/${loanId}`).expect(200);

    stats = await request(app).get('/api/stats/summary').expect(200);
    expect(stats.body.totalLiabilitiesCents).toBe(0);

    // 有交易的账户不允许删除
    await request(app).delete(`/api/accounts/${defaultAccountId}`).expect(409);
    // 无交易的账户可以删
    const empty = await request(app).post('/api/accounts').send({ name: '空账户' }).expect(201);
    await request(app).delete(`/api/accounts/${empty.body.id}`).expect(200);
  });
});
