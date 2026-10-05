import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_ENVIRONMENT,
  MINI_CONFIG,
  MINI_ENVIRONMENTS,
  setMiniEnvironment,
} from './env';
import { ApiError } from './errors';
import { request } from './http';
import { currentLedgerStore } from './currentLedger';
import { sessionStore } from './session';

function response(body: unknown, status = 200, header?: Record<string, string | string[]>) {
  return {
    statusCode: status,
    data: body,
    ...(header ? { header } : {}),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  setMiniEnvironment(ACTIVE_ENVIRONMENT);
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    request: vi.fn(),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    redirectTo: vi.fn(),
  });
  sessionStore.clear();
  currentLedgerStore.clear();
});

describe('request', () => {
  it('uses the selected environment configuration without embedding secrets', () => {
    expect(MINI_CONFIG).toBe(MINI_ENVIRONMENTS[ACTIVE_ENVIRONMENT]);
    expect(MINI_CONFIG.appId).toContain('REPLACE_WITH');
    expect(MINI_CONFIG.apiBaseUrl).toMatch(/^https?:\/\//);
  });

  it('uses the explicitly selected production API entry point', async () => {
    setMiniEnvironment('production');
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ ok: true }));
      return {} as never;
    });

    await request('/api/ledgers');

    expect(vi.mocked(wx.request).mock.calls[0]?.[0].url)
      .toBe(`${MINI_ENVIRONMENTS.production.apiBaseUrl}/api/ledgers`);
  });

  it('serializes JSON and attaches session and ledger context', async () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session', userId: 7 });
    currentLedgerStore.set({ id: 9, name: '我家', role: 'OWNER' });
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ ok: true }));
      return {} as never;
    });

    await expect(request<{ ok: boolean }>('/api/ledger', {
      method: 'POST',
      data: { amount: 100 },
    })).resolves.toEqual({ ok: true });

    expect(wx.request).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('/api/ledger'),
      method: 'POST',
      data: JSON.stringify({ amount: 100 }),
      header: expect.objectContaining({
        'Content-Type': 'application/json',
        Cookie: 'ledger_session=signed-session',
        'X-Ledger-Id': '9',
      }),
    }));
    expect(vi.mocked(wx.request).mock.calls[0]?.[0].header).not.toHaveProperty('Authorization');
  });

  it('normalizes non-2xx responses into ApiError', async () => {
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ error: { code: 'DENIED', message: '无权限' } }, 403));
      return {} as never;
    });

    await expect(request('/api/ledger')).rejects.toMatchObject({
      status: 403,
      code: 'DENIED',
      message: '无权限',
    });
    await expect(request('/api/ledger')).rejects.toBeInstanceOf(ApiError);
  });

  it('stores the ledger cookie returned by the backend', async () => {
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ userId: 7 }, 200, {
        'Set-Cookie': 'ledger_session=signed-session; Path=/; HttpOnly',
      }));
      return {} as never;
    });

    await request('/api/auth/wechat/login', { method: 'POST', data: { code: 'login-code' } });

    expect(sessionStore.get()).toEqual({ cookie: 'ledger_session=signed-session' });
  });

  it('does not attach a stale ledger after the current ledger is cleared', async () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session', userId: 7 });
    currentLedgerStore.set({ id: 9, name: '我家', role: 'OWNER' });
    currentLedgerStore.clear();
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ ok: true }));
      return {} as never;
    });

    await request('/api/ledger');

    expect(vi.mocked(wx.request).mock.calls[0]?.[0].header).not.toHaveProperty('X-Ledger-Id');
  });

  it('clears session and redirects to auth after 401', async () => {
    sessionStore.set({ cookie: 'ledger_session=signed-session', userId: 7 });
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ error: { code: 'AUTH_REQUIRED', message: '请登录' } }, 401));
      return {} as never;
    });

    await expect(request('/api/ledger')).rejects.toBeInstanceOf(ApiError);

    expect(sessionStore.get()).toBeNull();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/auth/index' });
  });

  it('clears ledger and redirects to ledger list after membership denial', async () => {
    currentLedgerStore.set({ id: 9, name: '我家', role: 'OWNER' });
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ error: { code: 'LEDGER_MEMBERSHIP_REQUIRED', message: '无账本权限' } }, 403));
      return {} as never;
    });

    await expect(request('/api/ledger')).rejects.toBeInstanceOf(ApiError);

    expect(currentLedgerStore.get()).toBeNull();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/ledger/list' });
  });

  it.each(['LEDGER_OWNER_REQUIRED', 'RECORD_CREATOR_REQUIRED', 'WEB_SESSION_REQUIRED'])
    ('keeps the current ledger for %s', async (code) => {
    const ledger = { id: 9, name: '我家', role: 'OWNER' } as const;
    currentLedgerStore.set(ledger);
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response({ error: { code, message: '无权执行此操作' } }, 403));
      return {} as never;
    });

    await expect(request('/api/ledger')).rejects.toMatchObject({ code });

    expect(currentLedgerStore.get()).toEqual(ledger);
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });

  it.each([
    { error: null },
    { error: 'not-an-object' },
    { unexpected: true },
  ])('wraps malformed error body %# as ApiError', async (body) => {
    vi.mocked(wx.request).mockImplementation(({ success }) => {
      success?.(response(body, 500));
      return {} as never;
    });

    await expect(request('/api/ledger')).rejects.toMatchObject({
      status: 500,
      code: 'UNKNOWN',
      message: '请求失败',
    });
    await expect(request('/api/ledger')).rejects.toBeInstanceOf(ApiError);
  });
});
