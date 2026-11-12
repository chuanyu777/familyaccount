import { sessionStore } from './session';

/**
 * 游客态判定：没有登录会话即游客。
 * 依赖 sessionStore.get() 已把微信 storage 的空字符串归一为 null。
 * 注意「已登录但没有账本」不算游客，那种情况仍走真实空态引导。
 */
export function isGuest(): boolean {
  return sessionStore.get() === null;
}
