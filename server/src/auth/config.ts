export interface AccessConfig {
  enabled: boolean;
  production: boolean;
  accessCode: string;
  sessionSecret: string;
  cookieName: 'family_access';
  sessionTtlMs: 2592000000;
}

type AccessEnvironment = {
  NODE_ENV?: string;
  FAMILY_ACCESS_CODE?: string;
  SESSION_SECRET?: string;
};

const SESSION_TTL_MS = 2_592_000_000;

export function readAccessConfig(env: AccessEnvironment): AccessConfig {
  const production = env.NODE_ENV === 'production';
  const accessCode = env.FAMILY_ACCESS_CODE?.trim() ?? '';

  return {
    enabled: production || accessCode !== '',
    production,
    accessCode,
    sessionSecret: env.SESSION_SECRET?.trim() ?? '',
    cookieName: 'family_access',
    sessionTtlMs: SESSION_TTL_MS,
  };
}

export function assertProductionAccessConfig(config: AccessConfig): void {
  if (!config.production) {
    return;
  }

  if (config.accessCode === '' || config.sessionSecret === '') {
    throw new Error('FAMILY_ACCESS_CODE and SESSION_SECRET are required in production');
  }
}
