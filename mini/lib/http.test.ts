import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './errors';
import { request } from './http';
import { currentLedgerStore } from './currentLedger';
import { sessionStore } from './session';

function response(body: unknown, status = 200) {
  return {
    statusCode: status,
    data: body,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
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
  it('serializes JSON and attaches session and ledger context', async () => {
    sessionStore.set({ token: 'mini-token', userId: 7 });
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
        Authorization: 'Bearer mini-token',
        'X-Ledger-Id': '9',
      }),
    }));
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

  it('does not attach a stale ledger after the current ledger is cleared', async () => {
    sessionStore.set({ token: 'mini-token', userId: 7 });
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
    sessionStore.set({ token: 'mini-token', userId: 7 });
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
});
