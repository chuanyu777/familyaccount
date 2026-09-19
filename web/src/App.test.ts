import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

const family = { id: 1, name: '我们的家' };
const summary = {
  totalAssetsCents: 1280000,
  totalLiabilitiesCents: 300000,
  netWorthCents: 980000,
  monthlyPaymentTotalCents: 500000,
  accountsTotalCents: 280000,
  assetsTotalCents: 1000000,
};

const accounts: unknown[] = [];
const members = [{ id: 1, name: '我' }];
const categories: unknown[] = [];
const emptyList = { items: [], page: 1, pageSize: 20, total: 0, incomeTotalCents: 0, expenseTotalCents: 0, netCents: 0 };

const get = vi.fn(async (path: string) => {
  if (path === '/api/family') return family;
  if (path === '/api/stats/summary') return summary;
  if (path === '/api/accounts') return accounts;
  if (path === '/api/members') return members;
  if (path === '/api/categories') return categories;
  if (path === '/api/transactions') return emptyList;
  if (path === '/api/assets') return [];
  if (path === '/api/liabilities') return [];
  return [];
});

vi.mock('./lib/api', () => ({
  cachedGet: (path: string) => get(path),
  apiGet: (path: string) => get(path),
  apiPost: vi.fn(async () => ({})),
  apiPatch: vi.fn(async () => ({})),
  apiPut: vi.fn(async () => ({})),
  apiDelete: vi.fn(async () => ({ ok: true })),
  invalidate: vi.fn(async () => undefined),
  ApiError: class extends Error {},
}));

async function flush() {
  for (let i = 0; i < 3; i += 1) await Promise.resolve();
}

describe('App', () => {
  beforeEach(() => {
    get.mockClear();
    document.body.innerHTML = '';
    window.location.hash = '#accounting';
  });

  it('页头显示「家庭财务」与家庭名，不再显示净资产', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flush();
    expect(wrapper.text()).toContain('家庭财务');
    expect(wrapper.text()).toContain('我们的家');
    expect(wrapper.text()).not.toContain('¥9,800.00');
    expect(document.querySelector('.seal')).toBeNull();
    wrapper.unmount();
  });

  it('reads a valid initial tab from the URL hash', async () => {
    window.location.hash = '#analysis';
    const wrapper = mount(App, { attachTo: document.body });
    await flush();
    expect(wrapper.find('[data-page="analysis"]').exists()).toBe(true);
    expect(wrapper.get('[aria-current="page"]').text()).toContain('分析');
    wrapper.unmount();
  });

  it('updates the hash from either responsive navigation', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flush();
    await wrapper.get('[data-mobile-tab="assets"]').trigger('click');
    expect(window.location.hash).toBe('#assets');
    expect(wrapper.find('[data-page="assets"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders five labeled mobile icons with a single active item', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flush();
    expect(wrapper.findAll('.mobile-tabbar__item')).toHaveLength(5);
    expect(wrapper.findAll('.mobile-tabbar__icon')).toHaveLength(5);
    expect(wrapper.findAll('.mobile-tabbar__item[aria-current="page"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('请求失败时不崩溃', async () => {
    get.mockRejectedValueOnce(new Error('boom'));
    const wrapper = mount(App, { attachTo: document.body });
    await flush();
    expect(wrapper.text()).toContain('家庭财务');
    wrapper.unmount();
  });
});
