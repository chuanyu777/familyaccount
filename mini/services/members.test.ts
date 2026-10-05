import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from '../lib/currentLedger';
import { leaveLedger } from './ledgers';
import {
  getSettingsCapabilities,
  canRemoveMember,
  listMembers,
  loadLedgerContext,
  removeMember,
  updateLedgerName,
} from './members';
import { request } from '../lib/http';

vi.mock('../lib/http', () => ({ request: vi.fn() }));
vi.mock('../lib/currentLedger', () => ({
  currentLedgerStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('./ledgers', () => ({ leaveLedger: vi.fn() }));

const requestMock = vi.mocked(request);
const currentLedgerStoreMock = vi.mocked(currentLedgerStore);
const leaveLedgerMock = vi.mocked(leaveLedger);

describe('member settings services and permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the selected ledger context from the ledger endpoint', async () => {
    const ledger = { id: 9, name: '我家', role: 'OWNER' };
    requestMock.mockResolvedValueOnce(ledger);

    await expect(loadLedgerContext(9)).resolves.toEqual(ledger);
    expect(requestMock).toHaveBeenCalledWith('/api/ledgers/9');
  });

  it('lists all membership rows, including inactive members', async () => {
    const members = [{ id: 2, ledgerId: 9, userId: 7, role: 'MEMBER', active: false, displayName: '小明' }];
    requestMock.mockResolvedValueOnce(members);

    await expect(listMembers(9)).resolves.toEqual(members);
    expect(requestMock).toHaveBeenCalledWith('/api/ledgers/9/members');
  });

  it('uses the owner endpoints for rename and member removal', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'OWNER' });
    requestMock.mockResolvedValueOnce({ id: 9, name: '新家', role: 'OWNER' });
    requestMock.mockResolvedValueOnce(undefined);

    await expect(updateLedgerName(9, '新家')).resolves.toMatchObject({ name: '新家' });
    await expect(removeMember(9, 12)).resolves.toBeUndefined();

    expect(requestMock).toHaveBeenNthCalledWith(1, '/api/ledgers/9', {
      method: 'PATCH', data: { name: '新家' },
    });
    expect(requestMock).toHaveBeenNthCalledWith(2, '/api/memberships/12', { method: 'DELETE' });
  });

  it('does not expose the owner membership as removable', () => {
    expect(canRemoveMember('OWNER', 'OWNER')).toBe(false);
    expect(canRemoveMember('OWNER', 'MEMBER')).toBe(true);
    expect(canRemoveMember('MEMBER', 'MEMBER')).toBe(false);
  });

  it('reuses Task 3 leaveLedger for a member without touching business data', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'MEMBER' });
    leaveLedgerMock.mockResolvedValueOnce(undefined);

    await expect(Promise.resolve().then(() => removeMember(9, 12))).rejects.toMatchObject({ code: 'LEDGER_OWNER_REQUIRED' });
    await expect((await import('./members')).leaveMemberLedger(9)).resolves.toBeUndefined();

    expect(leaveLedgerMock).toHaveBeenCalledWith(9);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('shows owner controls only to owners while keeping shared edits and leave for members', () => {
    expect(getSettingsCapabilities('OWNER')).toEqual({
      canInvite: true,
      canRemoveMembers: true,
      canRename: true,
      canArchiveResources: true,
      canEditSharedResources: true,
      canLeave: false,
    });
    expect(getSettingsCapabilities('MEMBER')).toEqual({
      canInvite: false,
      canRemoveMembers: false,
      canRename: false,
      canArchiveResources: false,
      canEditSharedResources: true,
      canLeave: true,
    });
  });
});
