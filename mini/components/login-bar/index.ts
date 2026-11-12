Component({
  methods: {
    goLogin(): void {
      wx.navigateTo({ url: '/pages/auth/index' });
    },
  },
});
