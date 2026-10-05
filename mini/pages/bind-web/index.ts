import { bindExistingWebAccount, getPostAuthRoute } from '../../services/auth';

interface BindPageContext {
  data: { bindingCode: string; loading: boolean };
  setData(data: { bindingCode?: string; loading?: boolean; errorMessage?: string }): void;
}

Page({
  data: { bindingCode: '', loading: false, errorMessage: '' },
  handleInput(event: { detail: { value: string } }): void {
    (this as unknown as BindPageContext).setData({ bindingCode: event.detail.value });
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
});
