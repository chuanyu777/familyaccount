import { bindExistingWebAccount, getPostAuthRoute, importWebLedger, previewWebLedgerImport, type WebLedgerImportPreview } from '../../services/auth';
import { currentLedgerStore } from '../../lib/currentLedger';
import { sessionStore } from '../../lib/session';

interface BindPageContext {
  data: { bindingCode: string; loading: boolean; preview: WebLedgerImportPreview | null; mode: 'bind' | 'import' };
  setData(data: { bindingCode?: string; loading?: boolean; preview?: WebLedgerImportPreview | null; mode?: 'bind' | 'import'; errorMessage?: string }): void;
}

Page({
  data: { bindingCode: '', loading: false, preview: null, mode: sessionStore.get() ? 'import' : 'bind', errorMessage: '' },
  handleInput(event: { detail: { value: string } }): void {
    (this as unknown as BindPageContext).setData({ bindingCode: event.detail.value, preview: null, errorMessage: '' });
  },
  async handlePreview(): Promise<void> {
    const page = this as unknown as BindPageContext;
    const bindingCode = page.data.bindingCode.trim();
    if (!bindingCode || page.data.loading) return;
    page.setData({ loading: true, errorMessage: '' });
    try {
      page.setData({ preview: await previewWebLedgerImport(bindingCode) });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '绑定码不可用，请重试' });
    } finally {
      page.setData({ loading: false });
    }
  },
  async handleBind(): Promise<void> {
    const page = this as unknown as BindPageContext;
    const bindingCode = page.data.bindingCode.trim();
    if (!bindingCode || page.data.loading) return;
    page.setData({ loading: true, errorMessage: '' });
    try {
      const result = await bindExistingWebAccount(bindingCode);
      wx.redirectTo({ url: getPostAuthRoute(result.ledgers) });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '绑定失败，请重试' });
    } finally {
      page.setData({ loading: false });
    }
  },
  async handleImport(): Promise<void> {
    const page = this as unknown as BindPageContext;
    const bindingCode = page.data.bindingCode.trim();
    if (!bindingCode || !page.data.preview || page.data.loading) return;
    page.setData({ loading: true, errorMessage: '' });
    try {
      const imported = await importWebLedger(bindingCode);
      currentLedgerStore.set({ id: imported.ledgerId, name: imported.ledgerName, role: imported.role });
      wx.redirectTo({ url: '/pages/ledger/list' });
    } catch (error) {
      page.setData({ errorMessage: error instanceof Error ? error.message : '导入失败，请重试' });
    } finally {
      page.setData({ loading: false });
    }
  },
});
