import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { currentLedgerStore } from '../../lib/currentLedger';
import { listAccounts } from '../../services/accounts';
import { listCategories, updateCategory, archiveSharedResource, restoreSharedResource } from '../../services/categories';
import { listTransactions } from '../../services/transactions';

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
vi.mock('../../services/business-state', () => ({
  activeEntries: (entries: Array<{ archived?: boolean | number }>) => entries.filter((entry) => !entry.archived),
  currentMonth: () => '2026-10',
  parseYuanToCents: vi.fn(() => 100),
}));
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  archiveSharedResource: vi.fn(),
  restoreSharedResource: vi.fn(),
}));
vi.mock('../../services/transactions', () => ({
  canDeleteTransaction: vi.fn(() => false),
  canEditTransaction: vi.fn(() => false),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  isGeneratedRepaymentTransaction: vi.fn(() => false),
  listTransactions: vi.fn(),
  updateTransaction: vi.fn(),
}));

const currentLedgerStoreMock = vi.mocked(currentLedgerStore);
const listAccountsMock = vi.mocked(listAccounts);
const listCategoriesMock = vi.mocked(listCategories);
const updateCategoryMock = vi.mocked(updateCategory);
const archiveSharedResourceMock = vi.mocked(archiveSharedResource);
const restoreSharedResourceMock = vi.mocked(restoreSharedResource);
const listTransactionsMock = vi.mocked(listTransactions);

type RegisteredPage = {
  data: any;
  setData: (data: Record<string, unknown>) => void;
  onShow(): Promise<void>;
  openCreate(): void;
  handleAccountInput(event: { detail: { value: string } }): void;
  startCategoryEdit(event: { currentTarget: { dataset: { id: string } } }): void;
  handleCategoryEditName(event: { detail: { value: string } }): void;
  saveCategoryEdit(): Promise<void>;
  toggleCategoryArchive(event: { currentTarget: { dataset: { id: string; archived: string } } }): Promise<void>;
};

let page: RegisteredPage;

beforeAll(async () => {
  vi.stubGlobal('Page', vi.fn());
  await import('./index');
  page = (vi.mocked(Page).mock.calls[0]?.[0] as RegisteredPage);
});

beforeEach(() => {
  vi.clearAllMocks();
  currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'MEMBER' });
  listAccountsMock.mockResolvedValue([{ id: 41, name: '现金' }]);
  listCategoriesMock.mockImplementation(async (kind) => [{ id: kind === 'expense' ? 5 : 6, kind, name: kind === 'expense' ? '餐饮' : '工资', archived: false }]);
  listTransactionsMock.mockResolvedValue({ items: [] });
  page.data = {
    ...page.data,
    accounts: [{ id: 41, name: '现金' }, { id: 99, name: '银行卡', isDefault: true }],
    draft: { ...page.data.draft, accountId: null },
    allExpenseCategories: [],
    allIncomeCategories: [],
    editingCategoryId: null,
    editingCategoryName: '',
  };
  page.setData = vi.fn((data: Record<string, unknown>) => Object.assign(page.data, data));
});

describe('accounting page business states', () => {
  it('uses the real account ID when the first account is selected', () => {
    page.handleAccountInput({ detail: { value: '0' } });

    expect(page.data.draft.accountId).toBe(41);
  });

  it('prefers the active default account when opening a new transaction', () => {
    page.openCreate();

    expect(page.data.draft.accountId).toBe(99);
  });

  it('keeps archived categories available for history but out of new-entry choices', async () => {
    listCategoriesMock.mockImplementation(async (kind) => [
      { id: kind === 'expense' ? 5 : 6, kind, name: kind === 'expense' ? '餐饮' : '工资', archived: false },
      { id: kind === 'expense' ? 8 : 9, kind, name: '旧分类', archived: true },
    ]);

    await page.onShow();

    expect(page.data.allExpenseCategories).toHaveLength(2);
    expect(page.data.expenseCategories).toEqual([{ id: 5, kind: 'expense', name: '餐饮', archived: false }]);
  });

  it('lets a member rename a category through the real category service', async () => {
    updateCategoryMock.mockResolvedValue({ id: 5, kind: 'expense', name: '外食', archived: false });
    page.data.allExpenseCategories = [{ id: 5, kind: 'expense', name: '餐饮', archived: false }];

    page.startCategoryEdit({ currentTarget: { dataset: { id: '5' } } });
    page.handleCategoryEditName({ detail: { value: '外食' } });
    await page.saveCategoryEdit();

    expect(updateCategoryMock).toHaveBeenCalledWith(5, '外食');
  });

  it('lets only the owner archive and restore categories through shared-resource endpoints', async () => {
    currentLedgerStoreMock.get.mockReturnValue({ id: 9, name: '我家', role: 'OWNER' });
    page.data.isOwner = true;
    archiveSharedResourceMock.mockResolvedValue(undefined);
    restoreSharedResourceMock.mockResolvedValue(undefined);

    await page.toggleCategoryArchive({ currentTarget: { dataset: { id: '5', archived: 'false' } } });
    await page.toggleCategoryArchive({ currentTarget: { dataset: { id: '5', archived: 'true' } } });

    expect(archiveSharedResourceMock).toHaveBeenCalledWith('categories', 5);
    expect(restoreSharedResourceMock).toHaveBeenCalledWith('categories', 5);
  });

  it('sets the main error state so failed loads do not render an empty state', async () => {
    listTransactionsMock.mockRejectedValue(new Error('交易服务不可用'));

    await page.onShow();

    expect(page.data.errorMessage).toContain('交易加载失败');
    expect(page.data.loading).toBe(false);
  });

  it('keeps the visible error retry and category management entry points in WXML', () => {
    const wxml = readFileSync(new URL('./index.wxml', import.meta.url), 'utf8');

    expect(wxml).toContain('wx:elif="{{errorMessage}}"');
    expect(wxml).toContain('bindtap="onShow"');
    expect(wxml).toContain('bindtap="startCategoryEdit"');
    expect(wxml).toContain('bindtap="toggleCategoryArchive"');
  });
});
