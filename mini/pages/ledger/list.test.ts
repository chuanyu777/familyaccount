import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from '../../lib/currentLedger';
import { leaveLedger } from '../../services/ledgers';

vi.mock('../../lib/currentLedger', () => ({
  currentLedgerStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('../../services/ledgers', () => ({
  createInvitation: vi.fn(),
  leaveLedger: vi.fn(),
  listLedgers: vi.fn(),
  switchLedger: vi.fn(),
}));

const currentLedgerStoreMock = vi.mocked(currentLedgerStore);
const leaveLedgerMock = vi.mocked(leaveLedger);

describe('ledger list page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('Page', vi.fn());
  });

  it('requests to leave an owner ledger when it is not the current ledger', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '当前账本', role: 'OWNER' });
    leaveLedgerMock.mockResolvedValueOnce(undefined);
    const pageRegistration = vi.mocked(Page).mock;
    await import('./list');
    const page = pageRegistration.calls[0]![0] as {
      data: { ledgers: Array<{ id: number; name: string; role: 'OWNER' | 'MEMBER' }> };
      setData: ReturnType<typeof vi.fn>;
      handleLeave(event: { currentTarget: { dataset: { id: number } } }): Promise<void>;
    };
    page.data = { ledgers: [{ id: 17, name: '其他账本', role: 'OWNER' }] };
    page.setData = vi.fn();

    await page.handleLeave({ currentTarget: { dataset: { id: 17 } } });

    expect(leaveLedgerMock).toHaveBeenCalledWith(17);
  });
});
