import { isGuest } from './guest';

export const LOGIN_PAGE = '/pages/auth/index';

/**
 * 写操作统一登录门槛。
 * 已登录返回 true 让调用方继续；游客弹提示并引导去登录，返回 false。
 */
export function requireLogin(): boolean {
  if (!isGuest()) return true;
  wx.showModal({
    title: '需要登录',
    content: '该功能需登录后使用，是否前往登录？',
    confirmText: '去登录',
    cancelText: '继续逛逛',
    success: (result) => {
      if (result.confirm) wx.navigateTo({ url: LOGIN_PAGE });
    },
  });
  return false;
}

/** 游客直接跳到登录页（用于整页受限的功能，如 AI 助手、邀请详情）。 */
export function goLogin(): void {
  wx.navigateTo({ url: LOGIN_PAGE });
}
