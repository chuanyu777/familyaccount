import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { cachedGet } from '../../lib/api';
import { currentMonth, formatMoney, shiftMonth } from '../../lib/format';
import { publishResources } from '../../lib/resourceInvalidation';
import AnalysisPage from './AnalysisPage.vue';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(),
}));

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
  { categoryId: 1, name: '餐饮', cents: 19000, percent: 38 },
  { categoryId: 2, name: '交通', cents: 17500, percent: 35 },
  { categoryId: 3, name: '其他', cents: 13500, percent: 27 },
];

const summary = {
  month: '2026-09',
  incomeCents: 100000,
  expenseCents: 50000,
  netCents: 50000,
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
    if (path.includes('monthly-snapshot')) {
      return Promise.resolve((overrides.summary ?? summary) as never);
    }
    if (path.includes('monthly-trend')) {
      return Promise.resolve((overrides.trend ?? trend) as never);
    }
    return Promise.resolve(undefined as never);
  });
}

function setupEmptyStats() {
  mockApi({
    summary: { ...summary, incomeCents: 0, expenseCents: 0, netCents: 0, breakdown: [] },
    trend: trend.map(({ month }) => ({ month, incomeCents: 0, expenseCents: 0, netCents: 0 })),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  vi.useRealTimers();
});

describe('分析页 · C3 结构', () => {
  it('renders historical balance metrics, account/asset split and estimation from the selected snapshot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 15));
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    const historical = { ...summary, month: '2026-08', totalAssetsCents: 8888800,
      totalLiabilitiesCents: 9999900, netWorthCents: -1111100, accountsTotalCents: 2222200,
      assetsTotalCents: 6666600, assetsEstimated: true };
    mockApi({ summary: historical });
    await wrapper.get('[aria-label="上一月"]').trigger('click');
    await settle();
    const balances = wrapper.get('[data-analysis-balances]');
    expect(balances.text()).toContain('2026年8月末');
    for (const value of [8888800, -9999900, -1111100, 2222200, 6666600]) {
      expect(balances.text()).toContain(formatMoney(value));
    }
    expect(balances.text()).toContain('资金账户');
    expect(balances.text()).toContain('资产项');
    expect(balances.text()).toContain('资不抵债');
    expect(balances.get('[data-assets-estimated]').text()).toContain('暂按当前市值计入');
    expect(mockedCachedGet.mock.calls.every(([path]) => path.startsWith('/api/stats/monthly-'))).toBe(true);
  });

  it('keeps asset-only historical months visible without an empty trend frame', async () => {
    setupEmptyStats();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    const balances = wrapper.get('[data-analysis-balances]');
    expect(balances.text()).toContain(formatMoney(summary.totalAssetsCents));
    expect(balances.find('[data-assets-estimated]').exists()).toBe(false);
    expect(wrapper.find('[data-chart-frame]').exists()).toBe(false);
  });

  it('renders the month picker inside the page header action', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(
      wrapper.get('.page-header__action').find('[aria-label="选择月份"]').exists(),
    ).toBe(true);
  });

  it('组合页头、月份选择和真实收支汇总', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(wrapper.get('h1').text()).toBe('分析');
    expect(wrapper.find('[aria-label="选择月份"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('当月结余');
    expect(wrapper.text()).toContain(formatMoney(summary.netCents));
    expect(wrapper.text()).toContain('当月收入');
    expect(wrapper.text()).toContain('当月支出');
  });

  it('renders paired income/expense bars and direct category percentages', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(document.querySelectorAll('[data-series="income"]')).toHaveLength(6);
    expect(document.querySelectorAll('[data-series="expense"]')).toHaveLength(6);
    expect(document.body.textContent).toContain('38%');
    expect(document.querySelectorAll('[data-category-bar]')).toHaveLength(3);
  });

  it('uses semantic unframed sections for both analysis groups', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(document.querySelectorAll('[data-analysis-section]')).toHaveLength(2);
    expect(document.querySelector('.section')).toBeNull();
  });

  it('支出分类色条不使用收入绿或主操作蓝，仅次分类使用琥珀色', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    const fills = wrapper.findAll('[data-category-bar] .category-chart__fill');
    expect(fills.map((fill) => fill.element.getAttribute('style'))).toEqual([
      'width: 38%; background: var(--expense);',
      'width: 35%; background: var(--chart-accent);',
      'width: 27%; background: var(--muted);',
    ]);
  });

  it('shows an actionable empty state instead of an empty chart frame', async () => {
    setupEmptyStats();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(document.querySelector('[data-empty-analysis]')).toBeTruthy();
    expect(document.querySelector('[data-chart-frame]')).toBeNull();
    expect(document.querySelectorAll('[data-series]')).toHaveLength(0);
    expect(wrapper.get('a[href="#accounting"]').text()).toBe('去记账');
    expect(document.body.textContent).toContain('记几笔账');
  });
});

describe('分析页 · 资源加载', () => {
  it('默认请求当前月的快照与六个月趋势', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    expect(mockedCachedGet.mock.calls).toEqual([
      ['/api/stats/monthly-snapshot', { month: currentMonth() }, { force: false }],
      ['/api/stats/monthly-trend', { months: 6, end: currentMonth() }, { force: false }],
    ]);
  });

  it('切换月份时强制刷新该月统计', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();
    mockedCachedGet.mockClear();

    await wrapper.get('[aria-label="上一月"]').trigger('click');
    await settle();

    expect(mockedCachedGet.mock.calls).toEqual([
      [
        '/api/stats/monthly-snapshot',
        { month: shiftMonth(currentMonth(), -1) },
        { force: true },
      ],
      [
        '/api/stats/monthly-trend',
        { months: 6, end: shiftMonth(currentMonth(), -1) },
        { force: true },
      ],
    ]);
  });

  it('忽略晚到的旧月份响应', async () => {
    const initialSnapshot = deferred<typeof summary>();
    const initialTrend = deferred<typeof trend>();
    const previousMonth = shiftMonth(currentMonth(), -1);
    const latestSummary = { ...summary, month: previousMonth, netCents: 222000 };

    mockedCachedGet.mockImplementation((path: string, params?: Record<string, unknown>) => {
      const isInitial = params?.month === currentMonth() || params?.end === currentMonth();
      if (path.includes('monthly-snapshot')) {
        return (isInitial ? initialSnapshot.promise : Promise.resolve(latestSummary)) as never;
      }
      return (isInitial ? initialTrend.promise : Promise.resolve(trend)) as never;
    });

    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await wrapper.get('[aria-label="上一月"]').trigger('click');
    await settle();
    expect(wrapper.text()).toContain(formatMoney(222000));

    initialSnapshot.resolve({ ...summary, netCents: 111000 });
    initialTrend.resolve(trend);
    await settle();
    expect(wrapper.text()).toContain(formatMoney(222000));
    expect(wrapper.text()).not.toContain(formatMoney(111000));
  });

  it('切月等待或失败时明确标记保留数据的月份，重试成功后恢复所选月份', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 15));
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    const pendingSnapshot = deferred<typeof summary>();
    const pendingTrend = deferred<typeof trend>();
    mockedCachedGet.mockImplementation((path: string) =>
      (path.includes('monthly-snapshot') ? pendingSnapshot.promise : pendingTrend.promise) as never,
    );

    await wrapper.get('[aria-label="上一月"]').trigger('click');
    expect(wrapper.get('[aria-label="选择月份"]').text()).toContain('8月');
    expect(wrapper.text()).toContain(formatMoney(summary.netCents));
    expect(wrapper.get('[data-retained-month]').text()).toContain('9月');
    expect(wrapper.get('.summary-strip__primary dt').text()).toContain('9月');
    expect(wrapper.get('.content-section__meta').text()).toContain('9月');

    pendingSnapshot.reject(new Error('网络异常'));
    pendingTrend.resolve(trend);
    await settle();
    expect(wrapper.get('[data-retained-month]').text()).toContain('9月');
    expect(wrapper.get('[role="alert"]').text()).toContain('网络异常');
    expect(wrapper.text()).toContain(formatMoney(summary.netCents));

    const priorMonth = shiftMonth(currentMonth(), -1);
    mockApi({ summary: { ...summary, month: priorMonth, netCents: 123000 } });
    await wrapper.get('[role="alert"] button').trigger('click');
    await settle();
    expect(wrapper.find('[data-retained-month]').exists()).toBe(false);
    expect(wrapper.get('.summary-strip__primary dt').text()).toBe('当月结余');
    expect(wrapper.get('.content-section__meta').text()).toContain('8月');
    expect(wrapper.text()).toContain(formatMoney(123000));
  });

  it('统计资源刷新失败时保留上次快照并提供重试', async () => {
    mockApi();
    wrapper = mount(AnalysisPage, { attachTo: document.body });
    await settle();

    const refreshedSnapshot = deferred<typeof summary>();
    const refreshedTrend = deferred<typeof trend>();
    mockedCachedGet.mockImplementation((path: string) =>
      (path.includes('monthly-snapshot')
        ? refreshedSnapshot.promise
        : refreshedTrend.promise) as never,
    );

    publishResources(['statistics']);
    await flushPromises();
    expect(wrapper.text()).toContain(formatMoney(summary.netCents));
    expect(wrapper.text()).toContain('正在更新分析');

    refreshedSnapshot.reject(new Error('网络异常'));
    refreshedTrend.resolve(trend);
    await settle();

    expect(wrapper.text()).toContain(formatMoney(summary.netCents));
    expect(wrapper.get('[role="alert"]').text()).toContain('网络异常');
    expect(wrapper.get('[role="alert"] button').text()).toBe('重试');
  });
});
