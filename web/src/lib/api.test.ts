import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock 整个 idbCache 模块，避免依赖真实 IndexedDB
vi.mock('./idbCache', () => ({
  idbGet: vi.fn(),
  idbSet: vi.fn(),
  idbDel: vi.fn(),
  idbClearByPrefix: vi.fn(),
}));

import {
  apiGet,
  apiPost,
  cachedGet,
  invalidate,
  loginLedger,
  loginPlatform,
  getSession,
  logout,
  createMiniBindingCode,
  setActiveLedgerId,
  getLedger,
} from './api';
import { resourceVersion } from './resourceInvalidation';
import { idbGet, idbSet, idbClearByPrefix } from './idbCache';

const mockedIdbGet = vi.mocked(idbGet);
const mockedIdbSet = vi.mocked(idbSet);
const mockedClear = vi.mocked(idbClearByPrefix);

function mockFetch(json: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const res = {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    text: async () => JSON.stringify(json),
    json: async () => json,
  };
  const fetchSpy = vi.fn(async () => res as unknown as Response);
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

beforeEach(async () => {
  mockFetch({ type: 'LEDGER_USER', userId: 7, webSession: true });
  await getSession('ledger');
  setActiveLedgerId(9);
  await invalidate();
  vi.clearAllMocks();
  mockedIdbGet.mockResolvedValue(undefined);
  mockedIdbSet.mockResolvedValue(undefined);
  mockedClear.mockResolvedValue(undefined);
});

describe('cachedGet 缓存命中', () => {
  it('命中缓存时立即返回缓存值且后台不请求网络', async () => {
    const cached = { id: 1, name: '我家' };
    mockedIdbGet.mockResolvedValue({ value: cached, ts: Date.now() });

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(cached),
      json: async () => cached,
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await cachedGet<{ id: number; name: string }>('/api/family');

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedIdbGet).toHaveBeenCalled();
  });

  it('无缓存时回退网络并把结果写入缓存', async () => {
    const data = { id: 2, name: '网络' };
    mockedIdbGet.mockResolvedValue(undefined);
    mockFetch(data);

    const result = await cachedGet<{ id: number; name: string }>('/api/family');

    expect(result).toEqual(data);
    expect(mockedIdbSet).toHaveBeenCalled();
  });
});

describe('写操作触发 invalidate', () => {
  it('apiPost 成功后清除相关缓存', async () => {
    mockFetch({ id: 1, name: '新成员' }, { status: 201 });

    await apiPost<{ id: number }>('/api/members', { name: '小明' });

    expect(mockedClear).toHaveBeenCalled();
  });

  it('相对路径写操作清除并发布对应资源', async () => {
    const version = resourceVersion(['transactions']);
    const before = version.value;
    mockFetch({ id: 1 }, { status: 201 });

    await apiPost('transactions', { type: 'expense' });

    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:/api/transactions');
    expect(version.value).not.toBe(before);
  });

  it('交易写操作只清除精确资源前缀且不会执行全量失效', async () => {
    mockFetch({ id: 1 }, { status: 201 });

    await apiPost('/api/transactions', { type: 'expense' });

    expect(mockedClear.mock.calls).toEqual([
      ['v2:ledger:7:9:/api/transactions'],
      ['v2:ledger:7:9:/api/accounts'],
      ['v2:ledger:7:9:/api/stats'],
    ]);
    expect(mockedClear).not.toHaveBeenCalledWith('');
  });

  it('invalidate 清空指定前缀', async () => {
    await invalidate('/api/transactions');
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:/api/transactions');
  });
});

describe('apiGet 错误包装', () => {
  it('非 2xx 抛出带 code/status 的错误', async () => {
    mockFetch({ error: { code: 'NOT_FOUND', message: '没找到' } }, { status: 404, ok: false });
    await expect(apiGet('/api/unknown')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('账本会话失效时只通知账本入口', async () => {
    const onLost = vi.fn();
    window.addEventListener('web-auth-lost', onLost, { once: true });
    mockFetch({ error: { code: 'AUTH_REQUIRED', message: '需要登录' } }, { status: 401, ok: false });

    await expect(apiGet('/api/family')).rejects.toMatchObject({ status: 401 });

    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onLost.mock.calls[0]?.[0]).toMatchObject({ detail: { kind: 'ledger' } });
  });
});

describe('Web authentication API', () => {
  it('sends ledger login with cookies and returns its session', async () => {
    mockFetch({ type: 'LEDGER_USER', userId: 7, webSession: true }, { status: 200 });

    await loginLedger('ledger-user', 'secret');

    expect(fetch).toHaveBeenCalledWith('/api/auth/web/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ username: 'ledger-user', password: 'secret' }),
    }));
  });

  it('keeps platform login and logout scoped to the platform kind', async () => {
    const loginFetch = mockFetch({ type: 'PLATFORM_ADMIN', platformAdminId: 9 });
    await loginPlatform('operator', 'secret');
    const logoutFetch = mockFetch(null, { status: 204 });
    await logout('platform');

    expect(loginFetch).toHaveBeenCalledWith('/api/auth/platform/login', expect.objectContaining({
      credentials: 'include',
    }));
    expect(logoutFetch).toHaveBeenCalledWith('/api/auth/logout?kind=platform', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });

  it('rejects a session response from the other auth surface', async () => {
    mockFetch({ type: 'LEDGER_USER', userId: 7 });

    await expect(getSession('platform')).rejects.toMatchObject({ code: 'SESSION_KIND_MISMATCH' });
    expect(fetch).toHaveBeenCalledWith('/api/auth/session?kind=platform', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('returns a binding code with an expiry for the ledger session', async () => {
    mockFetch({ code: 'short-lived-code', expiresAt: '2026-09-30 14:20:00' });

    const result = await createMiniBindingCode();

    expect(result.code).toBe('short-lived-code');
    expect(result.expiresAt).toBe('2026-09-30 14:20:00');
    expect(fetch).toHaveBeenCalledWith('/api/auth/binding-code', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });
});

describe('authenticated cache isolation', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }
  const response = (value: unknown, status = 200) => ({
    ok: status === 200, status, text: async () => JSON.stringify(value),
  }) as Response;

  it('namespaces the same URL by user and active ledger and clears previous scopes', async () => {
    mockFetch({ balance: 1 });
    await cachedGet('/api/accounts');
    expect(mockedIdbSet).toHaveBeenLastCalledWith('v2:ledger:7:9:/api/accounts', expect.anything());
    setActiveLedgerId(10);
    await cachedGet('/api/accounts');
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:');
    expect(mockedIdbGet).toHaveBeenLastCalledWith('v2:ledger:7:10:/api/accounts');
    mockFetch({ type: 'LEDGER_USER', userId: 8, webSession: true });
    await getSession('ledger');
    setActiveLedgerId(10);
    mockFetch({ balance: 2 });
    await cachedGet('/api/accounts');
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:10:');
    expect(mockedIdbGet).toHaveBeenLastCalledWith('v2:ledger:8:10:/api/accounts');
  });

  it('separates platform principals from ledger users and only clears the logged-out surface', async () => {
    mockFetch({ type: 'PLATFORM_ADMIN', platformAdminId: 7 });
    await getSession('platform');
    mockFetch([]);
    await cachedGet('/api/platform/ledgers');
    expect(mockedIdbGet).toHaveBeenLastCalledWith('v2:platform:7:none:/api/platform/ledgers');
    expect(fetch).toHaveBeenLastCalledWith('/api/platform/ledgers', expect.objectContaining({ headers: {} }));
    mockedClear.mockClear();
    await logout('platform');
    expect(mockedClear).toHaveBeenCalledWith('v2:platform:7:none:');
    expect(mockedClear).not.toHaveBeenCalledWith('v2:ledger:7:9:');
    await cachedGet('/api/accounts');
    expect(mockedIdbGet).toHaveBeenLastCalledWith('v2:ledger:7:9:/api/accounts');
  });

  it.each([false, true])('discards an old network result after scope change (background=%s)', async (background) => {
    const pending = deferred<Response>();
    if (background) mockedIdbGet.mockResolvedValueOnce({ value: ['old'], ts: 0 });
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const read = cachedGet('/api/accounts');
    // Wait until the actual old-scope request is in flight, not just the cache lookup.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const outcome = background ? read : expect(read).rejects.toMatchObject({ code: 'CACHE_SCOPE_CHANGED' });
    setActiveLedgerId(10);
    pending.resolve(response(['late old data']));
    await outcome;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });

  it('does not return an old cache lookup after the identity changes', async () => {
    const pending = deferred<{ value: string[]; ts: number }>();
    mockedIdbGet.mockReturnValueOnce(pending.promise);
    const read = cachedGet('/api/accounts');
    const outcome = expect(read).rejects.toMatchObject({ code: 'CACHE_SCOPE_CHANGED' });
    await vi.waitFor(() => expect(mockedIdbGet).toHaveBeenCalled());
    setActiveLedgerId(10);
    pending.resolve({ value: ['old'], ts: Date.now() });
    await outcome;
  });

  it('clears cache immediately on logout and blocks late responses even if logout fails', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const read = cachedGet('/api/accounts', undefined, { force: true });
    const outcome = expect(read).rejects.toMatchObject({ code: 'CACHE_SCOPE_CHANGED' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    mockFetch({ error: { code: 'UNAVAILABLE' } }, { status: 503 });
    await expect(logout('ledger')).rejects.toMatchObject({ status: 503 });
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:');
    pending.resolve(response(['old']));
    await outcome;
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });

  it('ignores a late 401 from a previous ledger scope', async () => {
    const pending = deferred<Response>();
    const onLost = vi.fn();
    window.addEventListener('web-auth-lost', onLost);
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const read = apiGet('/api/accounts');
    const outcome = expect(read).rejects.toMatchObject({ status: 401 });
    setActiveLedgerId(10);
    pending.resolve(response({ error: { code: 'AUTH_REQUIRED' } }, 401));
    await outcome;
    expect(onLost).not.toHaveBeenCalled();
    window.removeEventListener('web-auth-lost', onLost);
  });

  it('clears the current cache on a current-session 401', async () => {
    mockFetch({ error: { code: 'AUTH_REQUIRED' } }, { status: 401 });
    await expect(apiGet('/api/accounts')).rejects.toMatchObject({ status: 401 });
    await logout('ledger').catch(() => {});
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:');
    mockedIdbGet.mockClear();
    mockFetch([]);
    await cachedGet('/api/accounts');
    expect(mockedIdbGet).not.toHaveBeenCalled();
  });

  it('does not restore a session when a pending discovery finishes after logout', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const discovery = getSession('ledger');
    const outcome = expect(discovery).rejects.toMatchObject({ code: 'CACHE_SCOPE_CHANGED' });
    mockFetch(null, { status: 204 });
    await logout('ledger');
    pending.resolve(response({ type: 'LEDGER_USER', userId: 7, webSession: true }));
    await outcome;
    mockFetch([]);
    await cachedGet('/api/accounts');
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });

  it('orders logout cleanup after an already-started disk write', async () => {
    const pending = deferred<void>();
    mockedIdbSet.mockReturnValueOnce(pending.promise);
    mockFetch([]);
    const read = cachedGet('/api/accounts');
    const outcome = expect(read).rejects.toMatchObject({ code: 'CACHE_SCOPE_CHANGED' });
    await vi.waitFor(() => expect(mockedIdbSet).toHaveBeenCalled());
    const loggedOut = logout('ledger');
    expect(mockedClear).not.toHaveBeenCalledWith('v2:ledger:7:9:');
    pending.resolve();
    await Promise.all([outcome, loggedOut]);
    expect(mockedClear).toHaveBeenCalledWith('v2:ledger:7:9:');
  });

  it('does not persist a forced read that completes after a mutation invalidates it', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const read = cachedGet('/api/accounts', undefined, { force: true });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    mockFetch({ ok: true });
    await apiPost('/api/transactions', {});
    pending.resolve(response(['old']));
    await read;
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });

  it('rejects ordinary Mini Program sessions and requests server-verified Web context', async () => {
    mockFetch({ type: 'LEDGER_USER', userId: 7, webSession: false });
    await expect(getSession('ledger')).rejects.toMatchObject({ code: 'SESSION_KIND_MISMATCH' });
    mockFetch([{ id: 9, name: 'Special', role: 'OWNER', active: true, webLoginAllowed: true }]);
    await getLedger();
    expect(fetch).toHaveBeenCalledWith('/api/ledgers?surface=web', expect.anything());
  });
});

describe('写后刷新', () => {
  it('force: true 时无视缓存直接走网络', async () => {
    mockedIdbGet.mockResolvedValue({ value: { stale: true }, ts: Date.now() });
    const fresh = { stale: false };
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(fresh),
      json: async () => fresh,
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await cachedGet<{ stale: boolean }>('/api/assets', undefined, { force: true });

    expect(result).toEqual(fresh);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockedIdbGet).not.toHaveBeenCalled();
  });

  it('写操作后对应资源版本递增，页面据此重拉', async () => {
    const version = resourceVersion(['transactions']);
    const before = version.value;
    mockFetch({ id: 1 }, { status: 201 });
    await apiPost('/api/transactions', { type: 'expense' });
    expect(version.value).not.toBe(before);
  });

  it('写操作后不再把飞行中的旧结果写回缓存', async () => {
    // 第一次读：缓存过期 → 后台刷新起飞（这一步会 await 到网络返回）
    mockedIdbGet.mockResolvedValue({ value: { v: 1 }, ts: Date.now() - 60_000 });
    mockFetch({ v: 1 });
    await cachedGet('/api/assets');

    // 期间发生写操作
    mockFetch({ ok: true }, { status: 201 });
    await apiPost('/api/assets', { name: 'A' });

    mockedIdbSet.mockClear();
    await Promise.resolve(); // 让上一条后台刷新的尾巴跑完
    expect(mockedIdbSet).not.toHaveBeenCalled();
  });
});
