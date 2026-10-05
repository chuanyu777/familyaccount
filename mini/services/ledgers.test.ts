import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptInvitation,
  createInvitation,
  createLedger,
  leaveLedger,
  listLedgers,
  switchLedger,
} from './ledgers';
import { request } from '../lib/http';
import { currentLedgerStore } from '../lib/currentLedger';
import { invalidateLedgerScopedCache } from '../lib/ledgerCache';

vi.mock('../lib/http', () => ({ request: vi.fn() }));
vi.mock('../lib/currentLedger', () => ({
  currentLedgerStore: { set: vi.fn(), get: vi.fn(), clear: vi.fn() },
}));
vi.mock('../lib/ledgerCache', () => ({ invalidateLedgerScopedCache: vi.fn() }));

const requestMock = vi.mocked(request);
const currentLedgerStoreMock = vi.mocked(currentLedgerStore);
const invalidateMock = vi.mocked(invalidateLedgerScopedCache);

const ledger = { id: 9, name: '我家', role: 'OWNER' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('wx', { reLaunch: vi.fn() });
});

describe('ledger service', () => {
  it('lists ledgers from the ledger endpoint', async () => {
    requestMock.mockResolvedValueOnce([ledger]);

    await expect(listLedgers()).resolves.toEqual([ledger]);
    expect(requestMock).toHaveBeenCalledWith('/api/ledgers');
  });

  it('creates a ledger and selects it', async () => {
    requestMock.mockResolvedValueOnce(ledger);

    await expect(createLedger('我家')).resolves.toEqual(ledger);
    expect(requestMock).toHaveBeenCalledWith('/api/ledgers', {
      method: 'POST',
      data: { name: '我家' },
    });
    expect(currentLedgerStoreMock.set).toHaveBeenCalledWith(ledger);
  });

  it('accepts an invitation, fetches the returned ledger, and selects it', async () => {
    const membership = {
      id: 12, ledgerId: 17, userId: 7, role: 'MEMBER', active: true, displayName: '小明',
    };
    const acceptedLedger = { id: 17, name: '爸妈家', role: 'MEMBER' };
    requestMock
      .mockResolvedValueOnce(membership)
      .mockResolvedValueOnce(acceptedLedger);

    await expect(acceptInvitation('invite-token')).resolves.toEqual(membership);
    expect(requestMock).toHaveBeenNthCalledWith(1, '/api/invitations/accept', {
      method: 'POST', data: { token: 'invite-token' },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, '/api/ledgers/17');
    expect(currentLedgerStoreMock.set).toHaveBeenCalledWith(acceptedLedger);
  });

  it('switches locally, invalidates the previous scope, and relaunches the ledger shell', () => {
    currentLedgerStoreMock.get.mockReturnValue(ledger);

    switchLedger({ id: 17, name: '爸妈家', role: 'MEMBER' });

    expect(invalidateMock).toHaveBeenCalledWith(9);
    expect(currentLedgerStoreMock.set).toHaveBeenCalledWith({ id: 17, name: '爸妈家', role: 'MEMBER' });
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/ledger/home' });
  });

  it('creates invitations through the owner ledger endpoint', async () => {
    requestMock.mockResolvedValueOnce({ id: 4, ledgerId: 9, token: 'abc', expiresAt: '2026-10-12T00:00:00Z' });

    await expect(createInvitation()).resolves.toMatchObject({ ledgerId: 9, token: 'abc' });
    expect(requestMock).toHaveBeenCalledWith('/api/ledgers/9/invitations', { method: 'POST' });
  });

  it('rejects member invitation creation and owner leave before making a request', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'MEMBER' });
    await expect(createInvitation()).rejects.toMatchObject({ code: 'LEDGER_OWNER_REQUIRED' });
    await expect(leaveLedger(9, { id: 9, name: '我家', role: 'OWNER' })).rejects.toMatchObject({ code: 'OWNER_CANNOT_LEAVE' });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('leaves a member ledger and clears it when it is current', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'MEMBER' });
    requestMock.mockResolvedValueOnce(undefined);

    await leaveLedger(9);

    expect(requestMock).toHaveBeenCalledWith('/api/ledgers/9/leave', { method: 'POST' });
    expect(currentLedgerStoreMock.clear).toHaveBeenCalled();
  });
});
