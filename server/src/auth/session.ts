import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AccessConfig } from './config';

type SessionPayload = {
  exp: number;
};

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookieAttributes(config: AccessConfig): string {
  return `HttpOnly; SameSite=Strict; Path=/${config.production ? '; Secure' : ''}`;
}

export function createSessionCookie(config: AccessConfig, now: Date): string {
  const payload = Buffer.from(JSON.stringify({ exp: now.getTime() + config.sessionTtlMs })).toString('base64url');
  const value = `${payload}.${sign(payload, config.sessionSecret)}`;
  const maxAgeSeconds = config.sessionTtlMs / 1000;

  return `${config.cookieName}=${value}; Max-Age=${maxAgeSeconds}; ${cookieAttributes(config)}`;
}

export function verifySessionCookie(value: string, config: AccessConfig, now: Date): boolean {
  const [encodedPayload, signature, extra] = value.split('.');
  if (encodedPayload === undefined || signature === undefined || extra !== undefined) {
    return false;
  }

  const expectedSignature = sign(encodedPayload, config.sessionSecret);
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) && now.getTime() < payload.exp;
  } catch {
    return false;
  }
}

export function clearSessionCookie(config: AccessConfig): string {
  return `${config.cookieName}=; Max-Age=0; ${cookieAttributes(config)}`;
}

export function codesMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
