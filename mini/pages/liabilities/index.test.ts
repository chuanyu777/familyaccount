import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from '../../lib/currentLedger';
import { listAccounts } from '../../services/accounts';
import { listLiabilities, listRepayments } from '../../services/liabilities';

vi.mock('../../lib/currentLedger', () => ({
  currentLedgerStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('../../lib/session', () => ({
  sessionStore: { get: vi.fn(() => ({ userId: 12 })), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('../../services/accounts', () => ({
  activeAccounts: (accounts: Array<{ archived?: boolean | number }>) => accounts.filter((account) => !account.archived),
  accountIdAtPickerIndex: (accounts: Array<{ id: number }>, value: string | number) => accounts[Number(value)]?.id ?? null,
  listAccounts: vi.fn(),
  preferredAccountId: (accounts: Array<{ id: number; isDefault?: boolean; archived?: boolean | number }>) => {
    const active = accounts.filter((account) => !account.archived);
    return active.find((account) => account.isDefault)?.id ?? active[0]?.id ?? null;
  },
}));
vi.mock('../../services/liabilities', () => ({
  archiveSharedResource: vi.fn(),
  canEditRepayment: vi.fn(() => false),
  createLiability: vi.fn(),
  createRepayment: vi.fn(),
  deleteRepayment: vi.fn(),
  listLiabilities: vi.fn(),
  listRepayments: vi.fn(),
  restoreSharedResource: vi.fn(),
  updateLiability: vi.fn(),
  updateRepayment: vi.fn(),
}));

const currentLedgerStoreMock = vi.mocked(currentLedgerStore);
const listAccountsMock = vi.mocked(listAccounts);
const listLiabilitiesMock = vi.mocked(listLiabilities);
const listRepaymentsMock = vi.mocked(listRepayments);

type RegisteredPage = {
  data: any;
  setData: (data: Record<string, unknown>) => void;
  onShow(): Promise<void>;
  openRepayment(event: { currentTarget: { dataset: { id: string } } }): void;
  handleAccount(event: { detail: { value: string } }): void;
};

let page: RegisteredPage;

beforeAll(async () => {
  vi.stubGlobal('Page', vi.fn());
  await import('./index');
  page = (vi.mocked(Page).mock.calls[0]?.[0] as RegisteredPage);
});

beforeEach(() => {
  vi.clearAllMocks();
  currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'OWNER' });
  listAccountsMock.mockResolvedValue([
    { id: 41, name: '现金', archived: false },
    { id: 99, name: '旧账户', archived: true },
  ]);
  listLiabilitiesMock.mockResolvedValue([{ id: 7, name: '房贷', remainingCents: 10000, monthlyPaymentCents: 1000, archived: false }]);
  listRepaymentsMock.mockResolvedValue([]);
  page.data = { ...page.data, liabilities: [{ id: 7, name: '房贷', remainingCents: 10000, monthlyPaymentCents: 1000, archived: false }], accounts: [{ id: 41, name: '现金' }, { id: 99, name: '旧账户', archived: true }] };
  page.setData = vi.fn((data: Record<string, unknown>) => Object.assign(page.data, data));
});

describe('liabilities page account selection', () => {
  it('maps the first repayment account picker index to its real ID', () => {
    page.handleAccount({ detail: { value: '0' } });

    expect(page.data.accountId).toBe(41);
  });

  it('uses the first active account when there is no default and excludes archived accounts', async () => {
    await page.onShow();
    page.openRepayment({ currentTarget: { dataset: { id: '7' } } });

    expect(page.data.accounts).toEqual([{ id: 41, name: '现金', archived: false }]);
    expect(page.data.accountId).toBe(41);
  });
});
