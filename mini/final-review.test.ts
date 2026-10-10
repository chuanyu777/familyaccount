import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { invitationTokenStore, getPostAuthRoute } from './services/auth';
import { currentLedgerStore } from './lib/currentLedger';
import { sessionStore } from './lib/session';
import type { MiniRequestOptions } from './types/api';

type PageInstance = Record<string, any>;
let replies: Array<{ data: unknown; statusCode?: number; header?: Record<string, string> }>;
let requests: MiniRequestOptions[];
let storage: Map<string, unknown>;

async function page(path: string): Promise<PageInstance> {
  const register = vi.fn();
  vi.stubGlobal('Page', register);
  const imports: Record<string, () => Promise<unknown>> = {
    'ledger/list': () => import('./pages/ledger/list'),
    'ledger/empty': () => import('./pages/ledger/empty'),
    'auth/index': () => import('./pages/auth/index'),
    'bind-web/index': () => import('./pages/bind-web/index'),
    'invitation/detail': () => import('./pages/invitation/detail'),
    'assets/index': () => import('./pages/assets/index'),
    'liabilities/index': () => import('./pages/liabilities/index'),
    'accounting/index': () => import('./pages/accounting/index'),
    'analysis/index': () => import('./pages/analysis/index'),
    'settings/index': () => import('./pages/settings/index'),
  };
  await imports[path]!();
  const instance = register.mock.calls[0]![0] as PageInstance;
  instance.data = structuredClone(instance.data);
  instance.setData = (patch: Record<string, unknown>) => Object.assign(instance.data, patch);
  return instance;
}

function respond(...data: unknown[]): void { replies.push(...data.map((value) => ({ data: value }))); }
const ledger = { id: 9, name: '我家', role: 'OWNER' };
const account = { id: 41, name: '现金', balanceCents: 12345, balance: '123.45', archived: 0, isDefault: 1 };
const asset = { id: 7, name: '基金', valueCents: 10000, value: '100.00', archived: 1 };
const liability = { id: 8, name: '房贷', remainingCents: 10000, monthlyPaymentCents: 1000, archived: 0 };
const transaction = (id: number) => ({ id, type: 'expense', amountCents: 100, amount: '1.00', occurredOn: '2026-10-05', createdByUserId: 12, sourceType: 'manual' });
const transactionPage = (ids: number[], number = 1, total = 3) => ({
  items: ids.map(transaction), page: number, pageSize: 2, total,
  incomeTotalCents: 0, expenseTotalCents: 300, netCents: -300,
});
function accountingReplies(ids: number[] = [1, 2]): void {
  respond(transactionPage(ids), [account], [{ id: 5, kind: 'expense', name: '餐饮', archived: 0 }], []);
}
function requestedPaths(): string[] { return requests.map(({ url }) => new URL(url).pathname); }
function template(path: string): string { return readFileSync(new URL(`./pages/${path}.wxml`, import.meta.url), 'utf8'); }

beforeEach(() => {
  vi.stubEnv('TZ', 'Asia/Shanghai');
  vi.resetModules();
  replies = [];
  requests = [];
  storage = new Map();
  vi.stubGlobal('wx', {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    login: ({ success }: { success: (result: { code: string }) => void }) => success({ code: 'wx-code' }),
    request: (options: MiniRequestOptions) => {
      requests.push(options);
      const reply = replies.shift();
      if (!reply) throw new Error(`Missing HTTP fixture: ${options.url}`);
      options.success?.({ statusCode: 200, ...reply });
    },
    redirectTo: vi.fn(), navigateTo: vi.fn(), navigateBack: vi.fn(), reLaunch: vi.fn(), showToast: vi.fn(),
  });
  currentLedgerStore.set(ledger);
  sessionStore.set({ cookie: 'ledger_session=test', userId: 12 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('final review regressions', () => {
  it('#1 enables compilation of registered native TypeScript pages', () => {
    const config = JSON.parse(readFileSync(new URL('./project.config.json', import.meta.url), 'utf8'));
    expect(config.setting.useCompilerPlugins ?? []).toContain('typescript');
  });

  it('#2 serializes transaction filters without browser URLSearchParams', async () => {
    const { listTransactions } = await import('./services/transactions');
    vi.stubGlobal('URLSearchParams', undefined);
    respond(transactionPage([]));
    await expect(listTransactions({ month: '2026-10', type: 'expense', page: 2, pageSize: 20 })).resolves.toHaveProperty('page');
    expect(requests[0]!.url).toMatch(/\/api\/transactions\?month=2026-10&type=expense&page=2&pageSize=20$/);
  });

  it('#3 exposes an entry into the current single ledger', async () => {
    const instance = await page('ledger/list');
    respond([ledger]);
    await instance.onShow();
    // The current row must have an actionable shell entry, too.
    expect(template('ledger/list')).toMatch(/<button[^>]*bindtap="handleSwitch"[^>]*>[^<]*进入账本/);
    instance.handleSwitch({ currentTarget: { dataset: { ledger } } });
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/ledger/home' });
  });

  it('#4 keeps Web ledger binding as a secondary login support entry and reachable from an authenticated account', async () => {
    const auth = await page('auth/index');
    expect(typeof auth.handleBindWeb).toBe('function');
    auth.handleBindWeb();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/bind-web/index' });
    expect(requests).toHaveLength(0);
    expect(template('auth/index')).toContain('已有 Web 绑定码');
    expect(template('ledger/empty')).not.toContain('导入已有账本');
    const bind = await page('bind-web/index');
    bind.data.bindingCode = 'one-time-code';
    respond({ ledgerId: 1, ledgerName: '特殊账本', role: 'OWNER' });
    await bind.handlePreview();
    expect(requestedPaths()).toEqual(['/api/auth/web-ledger/preview']);
    expect(JSON.parse(requests[0]!.data as string)).toEqual({ bindingCode: 'one-time-code' });
    respond({ ledgerId: 1, ledgerName: '特殊账本', role: 'OWNER' });
    await bind.handleImport();
    expect(requestedPaths()).toEqual(['/api/auth/web-ledger/preview', '/api/auth/web-ledger/import']);
    expect(currentLedgerStore.get()?.id).toBe(1);
  });

  it('#4 binds a pre-existing Web account before creating a new WeChat identity', async () => {
    sessionStore.clear();
    const bind = await page('bind-web/index');
    expect(bind.data.mode).toBe('bind');
    bind.data.bindingCode = 'one-time-code';
    respond({ userId: 1, type: 'LEDGER_USER', webSession: false });
    respond([{ id: 1, name: '特殊账本', role: 'OWNER' }]);
    await bind.handleBind();
    expect(requestedPaths()).toEqual(['/api/auth/wechat/bind', '/api/ledgers']);
    expect(JSON.parse(requests[0]!.data as string)).toEqual({ bindingCode: 'one-time-code', code: 'wx-code' });
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/ledger/list' });
  });

  it.each([
    ['assets/index', 'toggleArchive', 'assets'],
    ['assets/index', 'toggleAccountArchive', 'accounts'],
    ['liabilities/index', 'toggleArchive', 'liabilities'],
    ['accounting/index', 'toggleCategoryArchive', 'categories'],
  ])('#5 restores numeric archived state on %s/%s', async (path, action, kind) => {
    const instance = await page(path);
    instance.data.isOwner = true;
    instance.onShow = vi.fn();
    respond(undefined);
    await instance[action]({ currentTarget: { dataset: { id: 7, archived: 1 } } });
    expect(requestedPaths()).toEqual([`/api/${kind}/7/restore`]);
  });

  it('#5 normalizes boolean-like archived values for new-entry choices', async () => {
    const { activeEntries } = await import('./services/business-state');
    const entries = [
      { id: 1, archived: 0 }, { id: 2, archived: 1 }, { id: 3, archived: false },
      { id: 4, archived: true }, { id: 5, archived: 'false' }, { id: 6, archived: 'true' },
      { id: 7, archived: '0' }, { id: 8, archived: '1' },
    ];
    expect(activeEntries(entries).map(({ id }) => id)).toEqual([1, 3, 5, 7]);
  });

  it('#6 prioritizes pending invitations after authentication for existing ledger users', () => {
    invitationTokenStore.set('a/b token');
    expect(getPostAuthRoute([ledger])).toBe('/pages/invitation/detail?token=a%2Fb%20token');
    expect(invitationTokenStore.get()).toBe('a/b token');
  });

  it('#6 offers invitation code entry in the no-ledger state without a launch token', async () => {
    const instance = await page('ledger/empty');
    instance.onShow();
    expect(template('ledger/empty')).not.toMatch(/<button\s+wx:if="\{\{hasInvitation\}\}"[^>]*bindtap="handleAcceptInvitation"/);
    instance.handleAcceptInvitation();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/invitation/detail' });
  });

  it('#6 preserves a direct share token and sends unauthenticated recipients through login', async () => {
    sessionStore.clear();
    const instance = await page('invitation/detail');
    instance.onLoad({ token: 'shared-token' });
    expect(invitationTokenStore.get()).toBe('shared-token');
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/auth/index' });
    expect(requests).toHaveLength(0);
  });

  it('#6 continues a shared invitation when an authenticated app resumes on another page', async () => {
    const register = vi.fn();
    vi.stubGlobal('App', register);
    await import('./app');
    const app = register.mock.calls[0]![0] as PageInstance;
    app.onShow({ path: 'pages/ledger/home', query: { token: 'resumed-token' } });
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/invitation/detail?token=resumed-token' });
    expect(invitationTokenStore.get()).toBe('resumed-token');
  });

  it('#7 presents category cents as yuan while retaining the original minor units', async () => {
    const instance = await page('analysis/index');
    respond({}, [], {}, [{ categoryId: 5, name: '餐饮', cents: 12345, percent: 100 }]);
    await instance.onShow();
    expect(instance.data.breakdown[0]).toEqual({ categoryId: 5, name: '餐饮', cents: 12345, amount: '123.45', percent: 100 });
    expect(template('analysis/index')).toContain('¥{{item.amount}}');
  });

  it('#8 appends the next page then stops at the backend total', async () => {
    const instance = await page('accounting/index');
    accountingReplies();
    await instance.onShow();
    expect(instance.data.hasMore).toBe(true);
    expect(typeof instance.loadMore).toBe('function');
    respond(transactionPage([3], 2));
    await instance.loadMore();
    expect(instance.data.items.map(({ id }: { id: number }) => id)).toEqual([1, 2, 3]);
    expect(new URL(requests[4]!.url).searchParams.get('page')).toBe('2');
    expect(instance.data.hasMore).toBe(false);
    await instance.loadMore();
    expect(requests).toHaveLength(5);
  });

  it('#8 keeps the first page on continuation failure and retries the same next page', async () => {
    const instance = await page('accounting/index');
    accountingReplies();
    await instance.onShow();
    expect(typeof instance.loadMore).toBe('function');
    replies.push({ statusCode: 500, data: { error: { code: 'INTERNAL_ERROR', message: '加载失败' } } });
    await instance.loadMore();
    expect(instance.data.items.map(({ id }: { id: number }) => id)).toEqual([1, 2]);
    expect(instance.data.page).toBe(1);
    expect(instance.data.loadMoreError).toBe('加载失败');
    respond(transactionPage([3], 2));
    await instance.loadMore();
    expect(new URL(requests[5]!.url).searchParams.get('page')).toBe('2');
    expect(instance.data.items.map(({ id }: { id: number }) => id)).toEqual([1, 2, 3]);
  });

  it('#8 ignores a late continuation after a month change and blocks duplicate continuation requests', async () => {
    const instance = await page('accounting/index');
    accountingReplies();
    await instance.onShow();
    expect(typeof instance.loadMore).toBe('function');
    const request = wx.request;
    let pending: MiniRequestOptions | undefined;
    wx.request = (options) => { pending = options; requests.push(options); };
    const continuation = instance.loadMore();
    await instance.loadMore();
    expect(requests).toHaveLength(5);
    wx.request = request;
    instance.data.month = '2026-09';
    respond(transactionPage([90], 1, 1), [account], [], []);
    await instance.onShow();
    pending!.success?.({ statusCode: 200, data: transactionPage([3], 2) });
    await continuation;
    expect(instance.data.items.map(({ id }: { id: number }) => id)).toEqual([90]);
    expect(instance.data.page).toBe(1);
    expect(instance.data.hasMore).toBe(false);
  });

  it('#9 calibrates the selected active account and refreshes its balance', async () => {
    const instance = await page('assets/index');
    instance.data.accounts = [account];
    expect(typeof instance.openCalibration).toBe('function');
    instance.openCalibration({ currentTarget: { dataset: { id: 41 } } });
    expect(instance.data.form).toBe('calibrate');
    expect(instance.data.value).toBe('123.45');
    instance.data.value = '-12.34';
    respond({ ...account, balanceCents: -1234, balance: '-12.34' }, [{ ...account, balanceCents: -1234, balance: '-12.34' }], []);
    await instance.saveForm();
    expect(requests[0]!.method).toBe('PATCH');
    expect(requestedPaths()[0]).toBe('/api/accounts/41/calibrate');
    expect(JSON.parse(requests[0]!.data as string)).toEqual({ balance: -12.34 });
    expect(instance.data.accounts[0].balanceCents).toBe(-1234);
    expect(template('assets/index')).toContain('bindtap="openCalibration"');
  });

  it('#9 rejects invalid calibration input before sending a write', async () => {
    const instance = await page('assets/index');
    instance.data.form = 'calibrate';
    instance.data.editingId = 41;
    instance.data.value = 'invalid';
    instance.onShow = vi.fn();
    await instance.saveForm();
    expect(instance.data.errorMessage).toBe('请输入有效的账户余额');
    expect(instance.data.form).toBe('calibrate');
    expect(requests).toHaveLength(0);
  });

  it('#9 keeps archived accounts out of balance calibration', async () => {
    const instance = await page('assets/index');
    instance.data.accounts = [{ ...account, archived: 1 }];
    expect(typeof instance.openCalibration).toBe('function');
    instance.openCalibration({ currentTarget: { dataset: { id: 41 } } });
    expect(instance.data.form).toBe('');
    expect(requests).toHaveLength(0);
  });

  it('#10 exposes snapshot history for archived assets and clears another asset history on failure', async () => {
    const instance = await page('assets/index');
    instance.data.assets = [asset];
    instance.data.snapshots = [{ id: 1, asset_id: 99, month: '2026-09', value: '100.00' }];
    replies.push({ statusCode: 500, data: { error: { code: 'INTERNAL_ERROR', message: '市值记录加载失败' } } });
    await instance.showSnapshots({ currentTarget: { dataset: { id: 7 } } });
    expect(instance.data.selectedAssetId).toBe(7);
    expect(instance.data.snapshots).toEqual([]);
    expect(instance.data.snapshotsError).toBe('市值记录加载失败');
    expect(template('assets/index')).toMatch(/<button(?![^>]*wx:if)[^>]*bindtap="showSnapshots"/);
    respond([{ id: 2, asset_id: 7, month: '2026-09', value_cents: 12345, value: '123.45', note: null, recorded_at: '2026-09-30' }]);
    await instance.showSnapshots({ currentTarget: { dataset: { id: 7 } } });
    expect(instance.data.snapshots[0].value).toBe('123.45');
    expect(requestedPaths()).toEqual(['/api/assets/7/snapshots', '/api/assets/7/snapshots']);
    await instance.openSnapshot({ currentTarget: { dataset: { id: 7 } } });
    expect(instance.data.form).toBe('');
    expect(requests).toHaveLength(2);
  });

  it.each(['accounting/index', 'liabilities/index'])('#11 uses the China-local calendar date in %s at midnight', async (path) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T16:15:00Z'));
    const instance = await page(path);
    if (path.startsWith('accounting')) {
      instance.data.accounts = [account];
      instance.openCreate();
      expect(instance.data.draft.occurredOn).toBe('2026-10-05');
    } else {
      instance.data.accounts = [account];
      instance.data.liabilities = [liability];
      instance.openRepayment({ currentTarget: { dataset: { id: 8 } } });
      expect(instance.data.occurredOn).toBe('2026-10-05');
    }
  });

  it('#12 displays chosen account labels, including default and transfer destination', async () => {
    const instance = await page('accounting/index');
    instance.data.accounts = [account, { ...account, id: 99, name: '银行卡', isDefault: 0 }];
    instance.openCreate();
    expect(instance.data.accountLabel).toBe('现金');
    instance.handleAccountInput({ detail: { value: '1' } });
    instance.handleToAccountInput({ detail: { value: '0' } });
    expect(instance.data.accountLabel).toBe('银行卡');
    expect(instance.data.toAccountLabel).toBe('现金');
    expect(template('accounting/index')).toContain('{{accountLabel}}');
  });

  it('#12 displays the repayment account label after defaulting and selection', async () => {
    const instance = await page('liabilities/index');
    instance.data.accounts = [account, { ...account, id: 99, name: '银行卡', isDefault: 0 }];
    instance.data.liabilities = [liability];
    instance.openRepayment({ currentTarget: { dataset: { id: 8 } } });
    expect(instance.data.accountLabel).toBe('现金');
    instance.handleAccount({ detail: { value: '1' } });
    expect(instance.data.accountLabel).toBe('银行卡');
    expect(template('liabilities/index')).toContain('{{accountLabel}}');
  });

  it('#12 displays category selection by ID and maps it to the picker index', async () => {
    const register = vi.fn();
    vi.stubGlobal('Component', register);
    await import('./components/category-picker/index');
    const component = register.mock.calls[0]![0] as PageInstance;
    const context = { data: { categories: [{ id: 5, name: '餐饮' }, { id: 9, name: '交通' }], value: 9 }, setData: vi.fn(), triggerEvent: vi.fn() };
    expect(typeof component.observers?.['categories, value']).toBe('function');
    component.observers['categories, value'].call(context, context.data.categories, 9);
    expect(context.setData).toHaveBeenCalledWith({ selectedIndex: 1, selectedLabel: '交通' });
  });

  it('#13 shares the invitation created in settings using its encoded token', async () => {
    const instance = await page('settings/index');
    respond({ id: 3, ledgerId: 9, token: 'a/b token', expiresAt: '2026-10-12' });
    await instance.handleInvite();
    expect(typeof instance.onShareAppMessage).toBe('function');
    expect(instance.onShareAppMessage()).toEqual({ title: '邀请你加入家庭账本', path: '/pages/invitation/detail?token=a%2Fb%20token' });
    expect(template('settings/index')).toContain('open-type="share"');
  });
});
