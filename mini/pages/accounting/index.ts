import { currentLedgerStore } from '../../lib/currentLedger';
import { sessionStore } from '../../lib/session';
import { accountIdAtPickerIndex, activeAccounts, listAccounts, preferredAccountId, type Account } from '../../services/accounts';
import { activeEntries, booleanLike, currentMonth, parseYuanToCents, todayIso } from '../../services/business-state';
import { archiveSharedResource, createCategory, listCategories, restoreSharedResource, updateCategory, type Category } from '../../services/categories';
import { canDeleteTransaction, canEditTransaction, createTransaction, deleteTransaction, isGeneratedRepaymentTransaction, listTransactions, updateTransaction, type TransactionRecord, type TransactionType } from '../../services/transactions';

interface Draft { type: TransactionType; amount: string; accountId: number | null; toAccountId: number | null; categoryId: number | null; occurredOn: string; note: string; }
interface Data { month: string; typeFilter: string; items: TransactionRecord[]; accounts: Account[]; expenseCategories: Category[]; incomeCategories: Category[]; allExpenseCategories: Category[]; allIncomeCategories: Category[]; draft: Draft; newCategoryName: string; editingCategoryId: number | null; editingCategoryName: string; editingId: number | null; formOpen: boolean; selected: TransactionRecord | null; selectedGenerated: boolean; selectedCanEdit: boolean; selectedCanDelete: boolean; confirmId: number | null; isOwner: boolean; loading: boolean; saving: boolean; errorMessage: string; referenceError: string; }
interface PageContext { data: Data & { accountLabel: string; toAccountLabel: string; page: number; pageSize: number; hasMore: boolean; loadingMore: boolean; loadMoreError: string }; transactionLoadId: number; syncAccountLabels(): void; setData(data: Partial<PageContext['data']>): void; onShow(): Promise<void>; }
function msg(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function emptyDraft(accountId: number | null = null): Draft { return { type: 'expense', amount: '', accountId, toAccountId: null, categoryId: null, occurredOn: todayIso(), note: '' }; }
function currentUserCan(record: TransactionRecord, action: 'edit' | 'delete'): boolean { const ledger = currentLedgerStore.get(); const allowed = ledger ? (action === 'edit' ? canEditTransaction : canDeleteTransaction) : () => false; return Boolean(ledger && allowed(record, sessionStore.get()?.userId ?? -1, ledger.role)); }

Page({
  transactionLoadId: 0,
  syncAccountLabels(): void {
    const page = this as unknown as PageContext;
    page.setData({
      accountLabel: page.data.accounts.find(({ id }) => id === page.data.draft.accountId)?.name ?? '请选择',
      toAccountLabel: page.data.accounts.find(({ id }) => id === page.data.draft.toAccountId)?.name ?? '请选择',
    });
  },
  data: { month: currentMonth(), typeFilter: '', accountLabel: '请选择', toAccountLabel: '请选择', items: [], page: 0, pageSize: 20, hasMore: false, loadingMore: false, loadMoreError: '', accounts: [], expenseCategories: [], incomeCategories: [], allExpenseCategories: [], allIncomeCategories: [], draft: emptyDraft(), newCategoryName: '', editingCategoryId: null, editingCategoryName: '', editingId: null, formOpen: false, selected: null, selectedGenerated: false, selectedCanEdit: false, selectedCanDelete: false, confirmId: null, isOwner: false, loading: false, saving: false, errorMessage: '', referenceError: '' },
  async onShow(): Promise<void> {
    const page = this as unknown as PageContext;
    const loadId = ++page.transactionLoadId;
    page.setData({ loading: true, page: 0, pageSize: 20, hasMore: false, loadingMore: false, loadMoreError: '', errorMessage: '', referenceError: '', isOwner: currentLedgerStore.get()?.role === 'OWNER' });
    const [transactions, accounts, expenses, incomes] = await Promise.allSettled([listTransactions({ month: page.data.month, type: page.data.typeFilter as TransactionType || undefined, page: 1, pageSize: 20 }), listAccounts(), listCategories('expense'), listCategories('income')]);
    if (loadId !== page.transactionLoadId) return;
    const errors: string[] = [];
    if (transactions.status === 'fulfilled') {
      const result = transactions.value;
      page.setData({ items: result.items, page: result.page, pageSize: result.pageSize, hasMore: result.page * result.pageSize < result.total });
    } else errors.push('交易加载失败');
    if (accounts.status === 'fulfilled') page.setData({ accounts: activeAccounts(accounts.value) }); else errors.push('账户加载失败');
    if (expenses.status === 'fulfilled') page.setData({ expenseCategories: activeEntries(expenses.value), allExpenseCategories: expenses.value }); else errors.push('支出分类加载失败');
    if (incomes.status === 'fulfilled') page.setData({ incomeCategories: activeEntries(incomes.value), allIncomeCategories: incomes.value }); else errors.push('收入分类加载失败');
    page.syncAccountLabels();
    page.setData({ errorMessage: errors.join('；'), referenceError: '', loading: false });
  },
  async loadMore(): Promise<void> {
    const page = this as unknown as PageContext;
    if (page.data.loading || page.data.loadingMore || !page.data.hasMore) return;
    const loadId = page.transactionLoadId;
    const ledgerId = currentLedgerStore.get()?.id;
    const month = page.data.month;
    const type = page.data.typeFilter;
    const isCurrent = () => loadId === page.transactionLoadId && ledgerId === currentLedgerStore.get()?.id && month === page.data.month && type === page.data.typeFilter;
    page.setData({ loadingMore: true, loadMoreError: '' });
    try {
      const result = await listTransactions({ month, type: type as TransactionType || undefined, page: page.data.page + 1, pageSize: page.data.pageSize });
      if (!isCurrent()) return;
      const existingIds = new Set(page.data.items.map(({ id }) => id));
      page.setData({ items: [...page.data.items, ...result.items.filter(({ id }) => !existingIds.has(id))], page: result.page, pageSize: result.pageSize, hasMore: result.page * result.pageSize < result.total });
    } catch (error) {
      if (isCurrent()) page.setData({ loadMoreError: msg(error, '更多交易加载失败，请重试') });
    } finally {
      if (isCurrent()) page.setData({ loadingMore: false });
    }
  },
  handleMonthInput(event: { detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ month: event.detail.value }); void page.onShow(); },
  handleTypeFilter(event: { detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ typeFilter: ['', 'expense', 'income', 'transfer'][Number(event.detail.value)] ?? '' }); void page.onShow(); },
  openCreate(): void { const page = this as unknown as PageContext; page.setData({ draft: emptyDraft(preferredAccountId(page.data.accounts)), newCategoryName: '', editingId: null, formOpen: true, errorMessage: '' }); page.syncAccountLabels(); },
  openDetail(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const selected = page.data.items.find(({ id }) => id === Number(event.currentTarget.dataset.id)) ?? null; page.setData({ selected, selectedGenerated: selected ? isGeneratedRepaymentTransaction(selected) : false, selectedCanEdit: selected ? currentUserCan(selected, 'edit') : false, selectedCanDelete: selected ? currentUserCan(selected, 'delete') : false }); },
  closeDetail(): void { (this as unknown as PageContext).setData({ selected: null, selectedGenerated: false, selectedCanEdit: false, selectedCanDelete: false }); },
  openEdit(): void { const page = this as unknown as PageContext; const item = page.data.selected; if (!item || !currentUserCan(item, 'edit')) return; page.setData({ selected: null, editingId: item.id, formOpen: true, draft: { type: item.type, amount: String((item.amountCents ?? 0) / 100), accountId: item.accountId ?? null, toAccountId: item.toAccountId ?? null, categoryId: item.categoryId ?? null, occurredOn: item.occurredOn ?? page.data.month + '-01', note: item.note ?? '' } }); page.syncAccountLabels(); },
  requestDelete(): void { const page = this as unknown as PageContext; if (page.data.selected && currentUserCan(page.data.selected, 'delete')) page.setData({ confirmId: page.data.selected.id, selected: null }); },
  async confirmDelete(): Promise<void> { const page = this as unknown as PageContext; if (page.data.confirmId === null) return; page.setData({ saving: true }); try { await deleteTransaction(page.data.confirmId); page.setData({ confirmId: null }); await page.onShow(); } catch (error) { page.setData({ errorMessage: msg(error, '删除失败，请重试') }); } finally { page.setData({ saving: false }); } },
  cancelDelete(): void { (this as unknown as PageContext).setData({ confirmId: null }); },
  closeForm(): void { const page = this as unknown as PageContext; if (!page.data.saving) page.setData({ formOpen: false }); },
  handleDraftInput(event: { currentTarget: { dataset: { field: keyof Draft } }; detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ draft: { ...page.data.draft, [event.currentTarget.dataset.field]: event.detail.value } }); },
  handleTypeInput(event: { detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ draft: { ...page.data.draft, type: (['expense', 'income', 'transfer'][Number(event.detail.value)] ?? 'expense') as TransactionType, categoryId: null, toAccountId: null } }); page.syncAccountLabels(); },
  handleAccountInput(event: { detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ draft: { ...page.data.draft, accountId: accountIdAtPickerIndex(page.data.accounts, event.detail.value) } }); page.syncAccountLabels(); },
  handleToAccountInput(event: { detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ draft: { ...page.data.draft, toAccountId: accountIdAtPickerIndex(page.data.accounts, event.detail.value) } }); page.syncAccountLabels(); },
  handleCategoryInput(event: { detail: { id: number } }): void { const page = this as unknown as PageContext; page.setData({ draft: { ...page.data.draft, categoryId: event.detail.id } }); },
  handleCategoryName(event: { detail: { value: string } }): void { (this as unknown as PageContext).setData({ newCategoryName: event.detail.value }); },
  async saveNewCategory(): Promise<void> { const page = this as unknown as PageContext; if (!page.data.newCategoryName.trim() || page.data.saving || page.data.draft.type === 'transfer') return; page.setData({ saving: true, errorMessage: '' }); try { const category = await createCategory(page.data.draft.type, page.data.newCategoryName); page.setData({ newCategoryName: '', draft: { ...page.data.draft, categoryId: category.id } }); await page.onShow(); } catch (error) { page.setData({ errorMessage: msg(error, '分类创建失败') }); } finally { page.setData({ saving: false }); } },
  startCategoryEdit(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const id = Number(event.currentTarget.dataset.id); const item = [...page.data.allExpenseCategories, ...page.data.allIncomeCategories].find(({ id: categoryId }) => categoryId === id); if (item && !item.archived) page.setData({ editingCategoryId: item.id, editingCategoryName: item.name, errorMessage: '' }); },
  handleCategoryEditName(event: { detail: { value: string } }): void { (this as unknown as PageContext).setData({ editingCategoryName: event.detail.value }); },
  async saveCategoryEdit(): Promise<void> { const page = this as unknown as PageContext; if (page.data.editingCategoryId === null || !page.data.editingCategoryName.trim() || page.data.saving) return; page.setData({ saving: true, errorMessage: '' }); try { await updateCategory(page.data.editingCategoryId, page.data.editingCategoryName); page.setData({ editingCategoryId: null, editingCategoryName: '' }); await page.onShow(); } catch (error) { page.setData({ errorMessage: msg(error, '分类更新失败') }); } finally { page.setData({ saving: false }); } },
  async toggleCategoryArchive(event: { currentTarget: { dataset: { id: string; archived: unknown } } }): Promise<void> { const page = this as unknown as PageContext; if (!page.data.isOwner) return; const id = Number(event.currentTarget.dataset.id); const archived = booleanLike(event.currentTarget.dataset.archived); try { if (archived) await restoreSharedResource('categories', id); else await archiveSharedResource('categories', id); await page.onShow(); } catch (error) { page.setData({ errorMessage: msg(error, '分类状态更新失败') }); } },
  async saveForm(): Promise<void> { const page = this as unknown as PageContext; const draft = page.data.draft; const cents = parseYuanToCents(draft.amount); if (page.data.saving) return; if (cents === null || cents <= 0) { page.setData({ errorMessage: '请输入正数金额' }); return; } if (!draft.accountId || (draft.type === 'transfer' && (!draft.toAccountId || draft.accountId === draft.toAccountId))) { page.setData({ errorMessage: '请选择不同的转出和转入账户' }); return; } page.setData({ saving: true, errorMessage: '' }); try { const input = { type: draft.type, amount: draft.amount, accountId: draft.accountId, ...(draft.type === 'transfer' ? { toAccountId: draft.toAccountId! } : draft.categoryId ? { categoryId: draft.categoryId } : {}), occurredOn: draft.occurredOn, note: draft.note.trim() }; if (page.data.editingId === null) await createTransaction(input); else await updateTransaction(page.data.editingId, input); page.setData({ formOpen: false }); await page.onShow(); } catch (error) { page.setData({ errorMessage: msg(error, '保存失败，请重试') }); } finally { page.setData({ saving: false }); } },
});
