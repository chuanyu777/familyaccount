import { createLedger } from '../../services/ledgers';
interface CreatePageContext { data: { name: string; loading: boolean }; setData(data: Record<string, unknown>): void; }
Page({
  data: { name: '', loading: false, errorMessage: '' },
  handleInput(event: { detail: { value: string } }): void { (this as unknown as CreatePageContext).setData({ name: event.detail.value }); },
  async handleSubmit(): Promise<void> {
    const page = this as unknown as CreatePageContext; const name = page.data.name.trim();
    if (!name || page.data.loading) return; page.setData({ loading: true, errorMessage: '' });
    try { await createLedger(name); wx.reLaunch({ url: '/pages/ledger/home' }); }
    catch (error) { page.setData({ errorMessage: error instanceof Error ? error.message : '创建失败，请重试' }); }
    finally { page.setData({ loading: false }); }
  },
});
