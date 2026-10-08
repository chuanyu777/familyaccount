import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentLedgerStore } from '../../lib/currentLedger';
import { archiveSharedResource, restoreSharedResource } from '../../services/business-state';
import { createCategory, listCategories, updateCategory } from '../../services/categories';

vi.mock('../../lib/currentLedger', () => ({
  currentLedgerStore: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}));
vi.mock('../../services/business-state', () => ({
  archiveSharedResource: vi.fn(),
  booleanLike: (value: unknown) => value === true || value === 1 || value === 'true' || value === '1',
  restoreSharedResource: vi.fn(),
}));
vi.mock('../../services/categories', () => ({
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
}));

type RegisteredPage = {
  data: any;
  setData(data: Record<string, unknown>): void;
  onShow(): Promise<void>;
  openCreate(): void;
  openEdit(event: { currentTarget: { dataset: { id: string; name: string } } }): void;
  handleName(event: { detail: { value: string } }): void;
  saveCategory(): Promise<void>;
  toggleArchive(event: { currentTarget: { dataset: { id: string; archived: string } } }): Promise<void>;
};

let page: RegisteredPage;

beforeAll(async () => {
  vi.stubGlobal('Page', vi.fn());
  await import('./index');
  page = vi.mocked(Page).mock.calls[0]?.[0] as RegisteredPage;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentLedgerStore.get).mockReturnValue({ id: 9, name: '我家', role: 'OWNER' });
  vi.mocked(listCategories).mockImplementation(async (kind) => [
    { id: kind === 'expense' ? 5 : 6, kind, name: kind === 'expense' ? '餐饮' : '工资', archived: false },
  ]);
  page.data = { ...page.data, expense: [], income: [], saving: false, editorOpen: false, editingId: null, nameDraft: '' };
  page.setData = vi.fn((data: Record<string, unknown>) => Object.assign(page.data, data));
});

describe('category management page', () => {
  it('loads expense and income categories and recognizes the owner', async () => {
    await page.onShow();

    expect(listCategories).toHaveBeenCalledWith('expense');
    expect(listCategories).toHaveBeenCalledWith('income');
    expect(page.data.expense[0].name).toBe('餐饮');
    expect(page.data.income[0].name).toBe('工资');
    expect(page.data.isOwner).toBe(true);
  });

  it('creates a category for the selected kind', async () => {
    vi.mocked(createCategory).mockResolvedValue({ id: 7, kind: 'expense', name: '交通' });
    page.openCreate();
    page.handleName({ detail: { value: '交通' } });

    await page.saveCategory();

    expect(createCategory).toHaveBeenCalledWith('expense', '交通');
    expect(page.data.editorOpen).toBe(false);
  });

  it('renames an existing category', async () => {
    vi.mocked(updateCategory).mockResolvedValue({ id: 5, kind: 'expense', name: '外食' });
    page.openEdit({ currentTarget: { dataset: { id: '5', name: '餐饮' } } });
    page.handleName({ detail: { value: '外食' } });

    await page.saveCategory();

    expect(updateCategory).toHaveBeenCalledWith(5, '外食');
  });

  it('archives and restores through the owner-only endpoints', async () => {
    vi.mocked(archiveSharedResource).mockResolvedValue(undefined);
    vi.mocked(restoreSharedResource).mockResolvedValue(undefined);
    page.data.isOwner = true;

    await page.toggleArchive({ currentTarget: { dataset: { id: '5', archived: 'false' } } });
    await page.toggleArchive({ currentTarget: { dataset: { id: '5', archived: 'true' } } });

    expect(archiveSharedResource).toHaveBeenCalledWith('categories', 5);
    expect(restoreSharedResource).toHaveBeenCalledWith('categories', 5);
  });
});
