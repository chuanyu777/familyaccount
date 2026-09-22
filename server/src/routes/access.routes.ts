import { Router } from 'express';
import { z } from 'zod';
import { clearSessionCookie, codesMatch, createSessionCookie } from '../auth/session';
import { hasValidAccessSession, type AccessDependencies } from '../middleware/access';

const unlockSchema = z.object({ code: z.string() });

function clientIp(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function accessRoutes(deps: AccessDependencies): Router {
  const { accessConfig, failedAttemptLimiter } = deps;
  const router = Router();

  router.post('/unlock', (req, res, next) => {
    try {
      if (!accessConfig.enabled) {
        res.status(204).end();
        return;
      }

      if (failedAttemptLimiter.isLimited(clientIp(req), new Date())) {
        res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '尝试次数过多，请稍后再试' } });
        return;
      }

      const { code } = unlockSchema.parse(req.body);
      if (!codesMatch(code, accessConfig.accessCode)) {
        failedAttemptLimiter.recordFailure(clientIp(req), new Date());
        res.status(401).json({ error: { code: 'ACCESS_DENIED', message: '家庭访问口令错误' } });
        return;
      }

      res.setHeader('Set-Cookie', createSessionCookie(accessConfig, new Date()));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/lock', (_req, res) => {
    res.setHeader('Set-Cookie', clearSessionCookie(accessConfig));
    res.status(204).end();
  });

  router.get('/session', (req, res) => {
    if (hasValidAccessSession(req, accessConfig)) {
      res.status(204).end();
      return;
    }

    res.status(401).json({
      error: { code: 'ACCESS_REQUIRED', message: '需要家庭访问口令' },
    });
  });

  return router;
}
