import type { NextFunction, Request, Response } from 'express';
import type { AccessConfig } from '../auth/config';
import { FailedAttemptLimiter } from '../auth/rateLimit';
import { verifySessionCookie } from '../auth/session';

export type AccessDependencies = {
  accessConfig: AccessConfig;
  failedAttemptLimiter: FailedAttemptLimiter;
};

export function sessionCookieFromRequest(req: Request, cookieName: string): string | undefined {
  const cookies = req.headers.cookie?.split(';') ?? [];

  for (const cookie of cookies) {
    const [name, ...value] = cookie.trim().split('=');
    if (name === cookieName) {
      return value.join('=');
    }
  }

  return undefined;
}

export function hasValidAccessSession(req: Request, accessConfig: AccessConfig): boolean {
  const cookie = sessionCookieFromRequest(req, accessConfig.cookieName);
  return cookie !== undefined && verifySessionCookie(cookie, accessConfig, new Date());
}

export function requireAccess({ accessConfig }: AccessDependencies) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!accessConfig.enabled || hasValidAccessSession(req, accessConfig)) {
      next();
      return;
    }

    res.status(401).json({
      error: { code: 'ACCESS_REQUIRED', message: '需要家庭访问口令' },
    });
  };
}
