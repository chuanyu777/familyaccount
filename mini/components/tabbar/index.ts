const routes: Record<string, string> = {
  accounting: '/pages/accounting/index',
  assets: '/pages/assets/index',
  liabilities: '/pages/liabilities/index',
  analysis: '/pages/analysis/index',
  settings: '/pages/settings/index',
};

Component({
  properties: { current: { type: String, value: 'accounting' } },
  data: {
    items: [
      { key: 'accounting', label: '记账', icon: 'receipt' },
      { key: 'assets', label: '资产', icon: 'wallet' },
      { key: 'liabilities', label: '负债', icon: 'landmark' },
      { key: 'analysis', label: '分析', icon: 'chart' },
      { key: 'settings', label: '设置', icon: 'settings' },
    ],
  },
  methods: {
    navigate(this: { data: { current: string } }, event: { currentTarget: { dataset: { route: string } } }): void {
      const url = routes[event.currentTarget.dataset.route];
      if (url && event.currentTarget.dataset.route !== this.data.current) wx.redirectTo({ url });
    },
  },
});
