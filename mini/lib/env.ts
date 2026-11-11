export interface MiniEnvironmentConfig {
  appId: string;
  apiBaseUrl: string;
}

// 同一个小程序，开发与生产共用 AppID；密钥只留在服务端，不写进客户端。
const APP_ID = 'wx29eb27ce3ac94f23';

/**
 * 固定使用正式环境（生产服务器）。
 *
 * 2026-11-11 起不再按「开发者工具 / 体验版 / 正式版」自动切换接口地址：
 * 小程序只连生产后端，登录页也不再展示环境提示文字。
 */
export const MINI_CONFIG: MiniEnvironmentConfig = {
  appId: APP_ID,
  apiBaseUrl: 'https://theseven.cc',
};

/** 当前配置 —— 运行时取值，避免「静态快照 + 动态函数」两套机制并存 */
export function getMiniConfig(): MiniEnvironmentConfig {
  return MINI_CONFIG;
}