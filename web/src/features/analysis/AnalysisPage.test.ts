import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { formatMoney, currentMonth, shiftMonth } from '../../lib/format';
import {
  cachedGet,
  apiPut,
  apiPost,
  apiPatch,
  apiDelete,
  ApiError,
} from '../../lib/api';
import AnalysisPage from './AnalysisPage.vue';

vi.mock('../../lib/api', () => {
  class ApiErrorImpl extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    cachedGet: vi.fn(),
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    invalidate: vi.fn(),
    ApiError: ApiErrorImpl,
  };
});

const mockedCachedGet = vi.mocked(cachedGet);

const trend = [
  { month: '2026-04', incomeCents: 100000, expenseCents: 60000, netCents: 40000 },
  { month: '2026-05', incomeCents: 120000, expenseCents: 90000, netCents: 30000 },
  { month: '2026-06', incomeCents: 90000, expenseCents: 70000, netCents: 20000 },
  { month: '2026-07', incomeCents: 110000, expenseCents: 50000, netCents: 60000 },
  { month: '2026-08', incomeCents: 130000, expenseCents: 80000, netCents: 50000 },
  { month: '2026-09', incomeCents: 100000, expenseCents: 40000, netCents: 60000 },
];

const breakdown = [
  { categoryId: 1, name: '餐饮', cents: 30000, percent: 60 },
  { categoryId: 2, name: '交通', cents: 15000, percent: 30 },
  { categoryId: 3, name: '其他', cents: 5000, percent: 10 },
];

const summary = {
  month: '2026-09',
  incomeCents: 100000,
  expenseCents: 40000,
  netCents: 60000,
  totalAssetsCents: 1200000,
  totalLiabilitiesCents: 800000,
  netWorthCents: 400000,
  monthlyPaymentTotalCents: 50000,
  accountsTotalCents: 200000,
  assetsTotalCents: 1000000,
  assetsEstimated: false,
  breakdown,
};

let wrapper: ReturnType<typeof mount> | null = null;

function mockApi(overrides: Record<string, unknown> = {}) {
  mockedCachedGet.mockImplementation((path: string) => {
    if (path.includes('monthly-snapshot'))
      return Promise.resolve((overrides.summary ?? summary) as never);
    if (path.includes('monthly-trend'))
      return Promise.resolve((overrides.trend ?? trend) as never);
    return Promise.resolve(undefined as never);
  });
}

async function settle() {
  await flushPromises();
  await flushPromises();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  wrapper = null;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('分析页 · 净资产概览', () => {
  it('展示总资产、总负债、净资产三个数字', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('总资产');
    expect(wrapper.text()).toContain('总负债');
    expect(wrapper.text()).toContain('净资产');
    expect(wrapper.text()).toContain(formatMoney(1200000));
    expect(wrapper.text()).toContain(formatMoney(800000));
    expect(wrapper.text()).toContain(formatMoney(400000));
  });

  it('净资产为负时标记为支出红并提示资不抵债', async () => {
    mockApi({ summary: { ...summary, netWorthCents: -12345 } });
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    const negative = wrapper.find('.net-worth.money--expense');
    expect(negative.exists()).toBe(true);
    expect(negative.text()).toContain('123.45');
    expect(wrapper.text()).toContain('资不抵债');
  });
});

describe('分析页 · 月度收支趋势', () => {
  it('按数据条数渲染柱子（每月收入+支出两根）', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.findAll('rect.trend-bar')).toHaveLength(12);
    expect(wrapper.text()).toContain('9月');
  });

  it('空趋势显示空状态不崩溃', async () => {
    mockApi({ trend: [] });
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('暂无收支数据');
    expect(wrapper.findAll('rect.trend-bar')).toHaveLength(0);
  });
});

describe('分析页 · 支出分类占比', () => {
  it('渲染环形扇段与图例', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.findAll('circle.donut-segment')).toHaveLength(3);
    expect(wrapper.text()).toContain('餐饮');
    expect(wrapper.text()).toContain('交通');
    expect(wrapper.text()).toContain('其他');
    expect(wrapper.text()).toContain(formatMoney(30000));
  });

  it('空占比显示空状态不崩溃', async () => {
    mockApi({ summary: { ...summary, breakdown: [] } });
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('这个月还没有支出');
    expect(wrapper.findAll('circle.donut-segment')).toHaveLength(0);
  });
});

describe('分析页 · 月份切换', () => {
  it('默认请求当前月的快照与趋势', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    const calls = mockedCachedGet.mock.calls.map((c) => [c[0], c[1]]);
    expect(calls).toEqual([
      ['/api/stats/monthly-snapshot', { month: currentMonth() }],
      ['/api/stats/monthly-trend', { months: 6, end: currentMonth() }],
    ]);
  });

  it('切到上月后按该月重新拉数据', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    mockedCachedGet.mockClear();

    await wrapper.get('[aria-label="上一月"]').trigger('click');
    await settle();

    const calls = mockedCachedGet.mock.calls.map((c) => [c[0], c[1]]);
    expect(calls).toEqual([
      ['/api/stats/monthly-snapshot', { month: shiftMonth(currentMonth(), -1) }],
      ['/api/stats/monthly-trend', { months: 6, end: shiftMonth(currentMonth(), -1) }],
    ]);
  });

  it('资产为估算值时给出提示', async () => {
    mockApi({ summary: { ...summary, assetsEstimated: true } });
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('还没记过市值');
  });
});

describe('分析页 · 失败降级', () => {
  it('接口异常时显示错误提示而不崩溃', async () => {
    mockedCachedGet.mockRejectedValue(new Error('网络异常'));
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    expect(wrapper.text()).toContain('网络异常');
    expect(wrapper.findAll('rect.trend-bar')).toHaveLength(0);
  });

  it('部分接口失败（Promise.all 整体失败）时整体降级为空状态不崩', async () => {
    mockedCachedGet.mockImplementation((path: string) => {
      if (path.includes('monthly-snapshot')) return Promise.reject(new Error('summary 失败'));
      if (path.includes('monthly-trend')) return Promise.resolve(trend as never);
      if (path.includes('category-breakdown')) return Promise.resolve(breakdown as never);
      return Promise.resolve(undefined as never);
    });
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    // Promise.all 任一失败即整体进入降级分支：图表与图例置空，但页面不崩
    expect(wrapper.findAll('rect.trend-bar')).toHaveLength(0);
    expect(wrapper.findAll('circle.donut-segment')).toHaveLength(0);
    expect(wrapper.text()).toContain('暂无收支数据');
  });
});
