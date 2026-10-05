import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PlatformApp from './PlatformApp.vue';
import { platformApi } from './platformApi';
import { ApiError, apiGet, getSession, loginPlatform, logout } from '../lib/api';

vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
  apiGet: vi.fn(),
  getSession: vi.fn(),
  loginPlatform: vi.fn(),
  logout: vi.fn(),
}));

const get = vi.mocked(apiGet);
const session = vi.mocked(getSession);
const login = vi.mocked(loginPlatform);
const exit = vi.mocked(logout);
const platformSession = { type: 'PLATFORM_ADMIN' as const, platformAdminId: 9 };
const summaries = [{ id: 42, name: '家庭账本', createdAt: '2026-09-30 10:00:00', ownerUserId: 7, ownerDisplayName: '张三', memberCount: 2, webEnabled: false }];
const detail = {
  ledger: { id: 42, name: '家庭账本', isWebEnabled: 0, createdByUserId: 7, createdAt: '2026-09-30 10:00:00' },
  members: [{ id: 1, userId: 7, displayName: '张三', role: 'OWNER', webLoginAllowed: 0, active: 1, joinedAt: '2026-09-30' }],
  accounts: [{ id: 3, name: '现金账户', balanceCents: 12000, isDefault: 1, archived: 0, createdAt: '2026-09-30' }],
  categories: [{ id: 4, kind: 'income', name: '工资', archived: 0, createdAt: '2026-09-30' }],
  transactions: [{ id: 5, type: 'transfer', amountCents: 1234, occurredOn: '2026-09-30', note: '账户调拨', accountId: 3, toAccountId: 10, categoryId: null, createdByUserId: 7, sourceType: 'manual', createdAt: '2026-09-30' }],
  assets: [{ id: 6, name: '房产', valueCents: 100000, kind: 'property', archived: 0, updatedAt: '2026-09-30' }],
  snapshots: [{ id: 7, assetId: 6, snapMonth: '2026-09', valueCents: 99000, note: '评估', recordedAt: '2026-09-30' }],
  liabilities: [{ id: 8, name: '房贷', remainingCents: 80000, monthlyPaymentCents: 2000, paymentDay: 10, archived: 0, createdAt: '2026-09-30' }],
  repayments: [{ id: 9, liabilityId: 8, amountCents: 2000, occurredOn: '2026-09-29', accountId: 3, transactionId: 5, createdByUserId: 7, createdAt: '2026-09-29' }],
  analysis: { memberCount: 1, transactionCount: 1, repaymentCount: 1, incomeCents: 1234, expenseCents: 0, netCents: 1234, accountBalanceCents: 12000, assetValueCents: 100000, liabilityRemainingCents: 80000 },
};

async function settle() { await flushPromises(); await flushPromises(); }

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/platform');
  session.mockRejectedValue(new Error('not signed in'));
  login.mockResolvedValue(platformSession);
  exit.mockResolvedValue(undefined);
  get.mockImplementation(async (path) => (path === '/api/platform/ledgers' ? summaries : detail) as never);
});

afterEach(() => { document.body.innerHTML = ''; });

describe('platform read-only console', () => {
  it('exposes only the two platform read helpers', () => {
    expect(Object.keys(platformApi)).toEqual(['listLedgers', 'getLedger']);
  });

  it('logs in, lists ledgers, searches by name or ID, and navigates to detail and back', async () => {
    const wrapper = mount(PlatformApp, { attachTo: document.body });
    await settle();
    await wrapper.get('input[name="username"]').setValue('operator');
    await wrapper.get('input[name="password"]').setValue('secret');
    await wrapper.get('form').trigger('submit');
    await settle();

    expect(login).toHaveBeenCalledWith('operator', 'secret');
    expect(get).toHaveBeenCalledWith('/api/platform/ledgers', undefined);
    expect(wrapper.text()).toContain('家庭账本');
    expect(wrapper.text()).toContain('张三');
    expect(wrapper.text()).toContain('2026-09-30');

    await wrapper.get('#platform-ledger-search').setValue('家庭');
    await wrapper.get('form[role="search"]').trigger('submit');
    await settle();
    expect(get).toHaveBeenCalledWith('/api/platform/ledgers', { query: '家庭' });
    await wrapper.get('#platform-ledger-search').setValue('42');
    await wrapper.get('form[role="search"]').trigger('submit');
    await settle();
    expect(get).toHaveBeenCalledWith('/api/platform/ledgers', { query: '42' });

    await wrapper.get('button[aria-label="查看家庭账本"]').trigger('click');
    await settle();
    expect(window.location.pathname).toBe('/platform/ledgers/42');
    expect(get).toHaveBeenCalledWith('/api/platform/ledgers/42');
    for (const section of ['成员', '交易', '账户', '分类', '资产', '资产快照', '负债', '还款', '分析汇总']) {
      expect(wrapper.find(`section[aria-label="${section}"]`).exists()).toBe(true);
    }
    const transactionSection = wrapper.get('section[aria-label="交易"]');
    expect(transactionSection.text()).toContain('转入账户 ID');
    expect(transactionSection.findAll('tbody tr')).toHaveLength(1);
    expect(transactionSection.findAll('tbody tr')[0]?.text()).toContain('账户调拨');
    expect(transactionSection.findAll('tbody tr')[0]?.text()).toContain('10');

    const snapshotSection = wrapper.get('section[aria-label="资产快照"]');
    expect(snapshotSection.findAll('tbody tr')).toHaveLength(1);
    expect(snapshotSection.findAll('tbody tr')[0]?.text()).toContain('2026-09');
    expect(snapshotSection.findAll('tbody tr')[0]?.text()).toContain('6');
    expect(snapshotSection.findAll('tbody tr')[0]?.text()).toContain('¥990.00');
    expect(snapshotSection.findAll('tbody tr')[0]?.text()).toContain('评估');

    const repaymentSection = wrapper.get('section[aria-label="还款"]');
    expect(repaymentSection.findAll('tbody tr')).toHaveLength(1);
    expect(repaymentSection.findAll('tbody tr')[0]?.text()).toContain('2026-09-29');
    expect(repaymentSection.findAll('tbody tr')[0]?.text()).toContain('8');
    expect(repaymentSection.findAll('tbody tr')[0]?.text()).toContain('¥20.00');
    expect(repaymentSection.findAll('tbody tr')[0]?.text()).toContain('3');
    expect(wrapper.text()).toContain('全期收入');
    expect(wrapper.text()).toContain('当前账户余额合计');
    expect(wrapper.text()).toContain('¥12.34');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/新增|编辑|删除|保存/);

    await wrapper.get('.platform-back').trigger('click');
    await settle();
    expect(window.location.pathname).toBe('/platform/ledgers');
    wrapper.unmount();
  });

  it('opens a detail URL directly and follows browser history', async () => {
    window.history.replaceState(null, '', '/platform/ledgers/42');
    session.mockResolvedValue(platformSession);
    const wrapper = mount(PlatformApp, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('房贷');
    window.history.replaceState(null, '', '/platform/ledgers');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await settle();
    expect(wrapper.find('#platform-ledger-search').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows a 403 permission error and retains the valid platform session', async () => {
    session.mockResolvedValue(platformSession);
    get.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'forbidden'));
    const wrapper = mount(PlatformApp, { attachTo: document.body });
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('无权查看');
    expect(wrapper.text()).toContain('退出登录');
    expect(wrapper.find('input[name="username"]').exists()).toBe(false);
    expect(exit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the platform session when detail access is forbidden', async () => {
    window.history.replaceState(null, '', '/platform/ledgers/42');
    session.mockResolvedValue(platformSession);
    get.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'forbidden'));
    const wrapper = mount(PlatformApp, { attachTo: document.body });
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('无权查看此账本');
    expect(wrapper.text()).toContain('退出登录');
    expect(wrapper.find('input[name="username"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
