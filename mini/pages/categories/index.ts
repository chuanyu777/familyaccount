import { currentLedgerStore } from '../../lib/currentLedger';
import { archiveSharedResource, booleanLike, restoreSharedResource } from '../../services/business-state';
import { createCategory, listCategories, updateCategory, type Category, type CategoryKind } from '../../services/categories';

interface Data {
  kind: CategoryKind;
  expense: Category[];
  income: Category[];
  editorOpen: boolean;
  editingId: number | null;
  nameDraft: string;
  isOwner: boolean;
  loading: boolean;
  saving: boolean;
  errorMessage: string;
}
interface PageContext { data: Data; setData(data: Partial<Data>): void; onShow(): Promise<void>; }
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

Page({
  data: { kind: 'expense', expense: [], income: [], editorOpen: false, editingId: null, nameDraft: '', isOwner: false, loading: false, saving: false, errorMessage: '' },
  async onShow(): Promise<void> {
    const page = this as unknown as PageContext;
    page.setData({ loading: true, errorMessage: '', isOwner: currentLedgerStore.get()?.role === 'OWNER' });
    try {
      const [expense, income] = await Promise.all([listCategories('expense'), listCategories('income')]);
      page.setData({ expense, income });
    } catch (error) { page.setData({ errorMessage: message(error, '分类加载失败') }); }
    finally { page.setData({ loading: false }); }
  },
  switchKind(event: { currentTarget: { dataset: { kind: CategoryKind } } }): void { (this as unknown as PageContext).setData({ kind: event.currentTarget.dataset.kind }); },
  openCreate(): void { (this as unknown as PageContext).setData({ editorOpen: true, editingId: null, nameDraft: '', errorMessage: '' }); },
  openEdit(event: { currentTarget: { dataset: { id: number; name: string } } }): void { (this as unknown as PageContext).setData({ editorOpen: true, editingId: Number(event.currentTarget.dataset.id), nameDraft: event.currentTarget.dataset.name, errorMessage: '' }); },
  closeEditor(): void { const page = this as unknown as PageContext; if (!page.data.saving) page.setData({ editorOpen: false }); },
  noop(): void {},
  handleName(event: { detail: { value: string } }): void { (this as unknown as PageContext).setData({ nameDraft: event.detail.value }); },
  async saveCategory(): Promise<void> {
    const page = this as unknown as PageContext;
    const name = page.data.nameDraft.trim();
    if (!name || page.data.saving) return;
    page.setData({ saving: true, errorMessage: '' });
    try {
      if (page.data.editingId === null) await createCategory(page.data.kind, name);
      else await updateCategory(page.data.editingId, name);
      page.setData({ editorOpen: false });
      await page.onShow();
    } catch (error) { page.setData({ errorMessage: message(error, '分类保存失败') }); }
    finally { page.setData({ saving: false }); }
  },
  async toggleArchive(event: { currentTarget: { dataset: { id: number; archived: unknown } } }): Promise<void> {
    const page = this as unknown as PageContext;
    if (!page.data.isOwner || page.data.saving) return;
    page.setData({ saving: true, errorMessage: '' });
    try {
      const id = Number(event.currentTarget.dataset.id);
      if (booleanLike(event.currentTarget.dataset.archived)) await restoreSharedResource('categories', id);
      else await archiveSharedResource('categories', id);
      await page.onShow();
    } catch (error) { page.setData({ errorMessage: message(error, '分类状态更新失败') }); }
    finally { page.setData({ saving: false }); }
  },
});
export {};
