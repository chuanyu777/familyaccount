import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureInvitationToken,
  bindExistingWebAccount,
  getPostAuthRoute,
  importWebLedger,
  loginWithWeChat,
  logout,
  previewWebLedgerImport,
  invitationTokenStore,
} from './auth';
import { request } from '../lib/http';
import { currentLedgerStore } from '../lib/currentLedger';
import { sessionStore } from '../lib/session';

vi.mock('../lib/http', () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    login: vi.fn(({ success }: { success?: (result: { code: string }) => void }) => {
      success?.({ code: 'wechat-code' });
    }),
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
  });
  sessionStore.clear();
  currentLedgerStore.clear();
  invitationTokenStore.clear();
});

describe('auth service', () => {
  it('logs in with WeChat and fetches the available ledgers', async () => {
    requestMock
      .mockResolvedValueOnce({ userId: 7, type: 'LEDGER_USER', webSession: false })
      .mockResolvedValueOnce([{ id: 9, name: '我家', role: 'OWNER', webEnabled: false }]);

    await expect(loginWithWeChat()).resolves.toEqual({
      userId: 7,
      type: 'LEDGER_USER',
      webSession: false,
      ledgers: [{ id: 9, name: '我家', role: 'OWNER', webEnabled: false }],
    });

    expect(requestMock).toHaveBeenNthCalledWith(1, '/api/auth/wechat/login', {
      method: 'POST',
      data: { code: 'wechat-code' },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, '/api/ledgers');
    expect(getPostAuthRoute([])).toBe('/pages/ledger/empty');
    expect(getPostAuthRoute([{ id: 9, name: '我家', role: 'OWNER' }])).toBe('/pages/ledger/list');
  });

  it('restores the stored ledger when it is still available to the user', async () => {
    currentLedgerStore.set({ id: 3, name: '工作账本', role: 'MEMBER' });
    requestMock
      .mockResolvedValueOnce({ userId: 7, type: 'LEDGER_USER', webSession: false })
      .mockResolvedValueOnce([
        { id: 3, name: '工作账本', role: 'MEMBER' },
        { id: 9, name: '我家', role: 'OWNER' },
      ]);

    await loginWithWeChat();

    expect(currentLedgerStore.get()).toEqual({ id: 3, name: '工作账本', role: 'MEMBER' });
  });

  it('binds an existing Web account before ordinary WeChat login', async () => {
    requestMock
      .mockResolvedValueOnce({ userId: 7, type: 'LEDGER_USER', webSession: false })
      .mockResolvedValueOnce([{ id: 9, name: '特殊账本', role: 'OWNER', webEnabled: true }]);

    await expect(bindExistingWebAccount('binding-code')).resolves.toMatchObject({ userId: 7 });
    expect(requestMock).toHaveBeenNthCalledWith(1, '/api/auth/wechat/bind', {
      method: 'POST', data: { bindingCode: 'binding-code', code: 'wechat-code' },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, '/api/ledgers');
    expect(sessionStore.get()).toBeNull();
  });

  it('uses the stable first ledger when the stored ledger is unavailable', async () => {
    currentLedgerStore.set({ id: 99, name: '已离开账本', role: 'MEMBER' });
    requestMock
      .mockResolvedValueOnce({ userId: 7, type: 'LEDGER_USER', webSession: false })
      .mockResolvedValueOnce([
        { id: 3, name: '工作账本', role: 'MEMBER' },
        { id: 9, name: '我家', role: 'OWNER' },
      ]);

    await loginWithWeChat();

    expect(currentLedgerStore.get()).toEqual({ id: 3, name: '工作账本', role: 'MEMBER' });
  });

  it('previews an existing Web ledger with the current WeChat session', async () => {
    sessionStore.set({ cookie: 'ledger_session=valid-session', userId: 7 });
    requestMock.mockResolvedValueOnce({ ledgerId: 3, ledgerName: '旧家庭账本', role: 'OWNER' });

    await expect(previewWebLedgerImport('binding-code')).resolves.toEqual({ ledgerId: 3, ledgerName: '旧家庭账本', role: 'OWNER' });

    expect(requestMock).toHaveBeenCalledWith('/api/auth/web-ledger/preview', {
      method: 'POST',
      data: { bindingCode: 'binding-code' },
    });
    expect(sessionStore.get()).toEqual({ cookie: 'ledger_session=valid-session', userId: 7 });
  });

  it('imports a selected Web ledger without replacing the current WeChat session', async () => {
    sessionStore.set({ cookie: 'ledger_session=valid-session', userId: 7 });
    requestMock.mockResolvedValueOnce({ ledgerId: 3, ledgerName: '旧家庭账本', role: 'MEMBER' });

    await expect(importWebLedger('binding-code')).resolves.toEqual({ ledgerId: 3, ledgerName: '旧家庭账本', role: 'MEMBER' });
    expect(requestMock).toHaveBeenCalledWith('/api/auth/web-ledger/import', {
      method: 'POST', data: { bindingCode: 'binding-code' },
    });
    expect(sessionStore.get()).toEqual({ cookie: 'ledger_session=valid-session', userId: 7 });
  });

  it('clears the session and current ledger on logout', async () => {
    sessionStore.set({ cookie: 'ledger_session=valid-session', userId: 7 });
    currentLedgerStore.set({ id: 9, name: '我家', role: 'OWNER' });
    requestMock.mockResolvedValueOnce(undefined);

    await logout();

    expect(requestMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(sessionStore.get()).toBeNull();
    expect(currentLedgerStore.get()).toBeNull();
  });

  it('keeps an invitation token from launch or share query for the next flow', () => {
    captureInvitationToken({ token: 'invite-token' });

    expect(invitationTokenStore.get()).toBe('invite-token');
  });
});
