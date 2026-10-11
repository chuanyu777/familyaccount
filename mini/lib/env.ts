export type MiniEnvironment = 'development' | 'production';

export interface MiniEnvironmentConfig {
  appId: string;
  apiBaseUrl: string;
}

// 同一个小程序，开发与生产共用 AppID；密钥只留在服务端，不写进客户端。
const APP_ID = 'wx29eb27ce3ac94f23';

export const MINI_ENVIRONMENTS: Record<MiniEnvironment, MiniEnvironmentConfig> = {
  development: {
    appId: APP_ID,
    // 本机 Docker 的 web 容器：80 提供静态页与 /api 反代（后端 3001 未映射到宿主机）
    apiBaseUrl: 'http://127.0.0.1:80',
  },
  production: {
    appId: APP_ID,
    apiBaseUrl: 'https://theseven.cc',
  },
};

/** 基础库提供 getAccountInfoSync，但项目里的小程序类型定义未覆盖，这里声明最小接口。 */
interface AccountInfoSyncApi {
  getAccountInfoSync?: () => { miniProgram?: { envVersion?: string } };
}

/**
 * 按小程序版本类型自动选环境：
 *   develop（开发者工具）→ development
 *   trial（体验版）/ release（正式版）→ production
 *
 * 体验版也走生产，是因为体验版本就是上线前的正式验证，而生产后端只有一个。
 * wx.getAccountInfoSync() 在非小程序环境（如 vitest）不可用，兜底为 development，
 * 这样单测无需额外 mock。
 */
function detectEnvironment(): MiniEnvironment {
  try {
    const api = wx as unknown as AccountInfoSyncApi;
    const envVersion = api.getAccountInfoSync?.().miniProgram?.envVersion;
    // 只有明确的体验版/正式版才走生产；其余情况（类型缺失、测试环境）一律按本地开发处理
    return envVersion === 'release' || envVersion === 'trial' ? 'production' : 'development';
  } catch {
    // 非小程序环境（如 vitest）里 wx 不存在，兜底为 development
    return 'development';
  }
}

let current: MiniEnvironment = detectEnvironment();

/** 当前环境（正式版/体验版自动为 production，无需手改源码） */
export function activeEnvironment(): MiniEnvironment {
  return current;
}

/** 当前配置 —— 运行时取值，避免「静态快照 + 动态函数」两套机制并存 */
export function getMiniConfig(): MiniEnvironmentConfig {
  return MINI_ENVIRONMENTS[current];
}

/** 仅供测试显式切换环境 */
export function setMiniEnvironment(environment: MiniEnvironment): void {
  current = environment;
}

// 兼容既有引用（http.test.ts 在用）：模块加载时的快照
export const ACTIVE_ENVIRONMENT: MiniEnvironment = current;
export const MINI_CONFIG: MiniEnvironmentConfig = MINI_ENVIRONMENTS[current];
