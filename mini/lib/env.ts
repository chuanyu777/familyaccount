export type MiniEnvironment = 'development' | 'production';

export interface MiniEnvironmentConfig {
  appId: string;
  apiBaseUrl: string;
}

// Keep app secrets on the server. Replace the documented placeholders per build.
export const ACTIVE_ENVIRONMENT: MiniEnvironment = 'development';

export const MINI_ENVIRONMENTS: Record<MiniEnvironment, MiniEnvironmentConfig> = {
  development: {
    appId: 'REPLACE_WITH_WECHAT_APP_ID',
    apiBaseUrl: 'http://127.0.0.1:3001',
  },
  production: {
    appId: 'REPLACE_WITH_WECHAT_APP_ID',
    apiBaseUrl: 'https://REPLACE_WITH_API_HOST',
  },
};

let selectedEnvironment: MiniEnvironment = ACTIVE_ENVIRONMENT;

export const MINI_CONFIG = MINI_ENVIRONMENTS[ACTIVE_ENVIRONMENT];

export function setMiniEnvironment(environment: MiniEnvironment): void {
  selectedEnvironment = environment;
}

export function getMiniConfig(): MiniEnvironmentConfig {
  return MINI_ENVIRONMENTS[selectedEnvironment];
}
