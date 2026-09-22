import { describe, expect, it } from 'vitest';
import { assertProductionAccessConfig, readAccessConfig } from './config';
import { FailedAttemptLimiter } from './rateLimit';
import {
  clearSessionCookie,
  codesMatch,
  createSessionCookie,
  verifySessionCookie,
} from './session';

const config = readAccessConfig({
  NODE_ENV: 'production',
  FAMILY_ACCESS_CODE: 'house-code',
  SESSION_SECRET: 'x'.repeat(48),
});

function cookieValue(setCookie: string): string {
  return setCookie.split(';', 1)[0]!.split('=', 2)[1]!;
}

describe('access configuration', () => {
  it('requires both access secrets in production', () => {
    expect(() => assertProductionAccessConfig(readAccessConfig({ NODE_ENV: 'production' }))).toThrow();
    expect(() => assertProductionAccessConfig(config)).not.toThrow();
  });

  it('leaves development access disabled without a code', () => {
    expect(readAccessConfig({ NODE_ENV: 'development' }).enabled).toBe(false);
  });
});

describe('signed household access sessions', () => {
  it('accepts a signed cookie before its 30-day expiry', () => {
    const value = cookieValue(createSessionCookie(config, new Date('2026-09-22')));

    expect(verifySessionCookie(value, config, new Date('2026-10-21'))).toBe(true);
  });

  it('rejects a signed cookie after its 30-day expiry', () => {
    const value = cookieValue(createSessionCookie(config, new Date('2026-09-22')));

    expect(verifySessionCookie(value, config, new Date('2026-10-23'))).toBe(false);
  });

  it('rejects malformed and modified cookie values', () => {
    const value = cookieValue(createSessionCookie(config, new Date('2026-09-22')));

    expect(verifySessionCookie('not-a-session', config, new Date('2026-09-23'))).toBe(false);
    expect(verifySessionCookie(`${value}x`, config, new Date('2026-09-23'))).toBe(false);
  });

  it('rejects sessions after signing-secret rotation', () => {
    const value = cookieValue(createSessionCookie(config, new Date('2026-09-22')));
    const rotated = readAccessConfig({
      NODE_ENV: 'production',
      FAMILY_ACCESS_CODE: 'house-code',
      SESSION_SECRET: 'y'.repeat(48),
    });

    expect(verifySessionCookie(value, rotated, new Date('2026-09-23'))).toBe(false);
  });

  it('sets and clears a strict HttpOnly cookie', () => {
    expect(createSessionCookie(config, new Date('2026-09-22'))).toContain(
      'HttpOnly; SameSite=Strict; Path=/; Secure',
    );
    expect(clearSessionCookie(config)).toContain('Max-Age=0');
  });

  it('accepts only the configured household code', () => {
    expect(codesMatch('house-code', config.accessCode)).toBe(true);
    expect(codesMatch('wrong', config.accessCode)).toBe(false);
  });
});

describe('failed unlock limiter', () => {
  it('blocks the sixth attempt and releases it when the rolling window expires', () => {
    const limiter = new FailedAttemptLimiter();
    const startedAt = new Date('2026-09-22T00:00:00.000Z');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.isLimited('203.0.113.7', startedAt)).toBe(false);
      limiter.recordFailure('203.0.113.7', startedAt);
    }

    expect(limiter.isLimited('203.0.113.7', startedAt)).toBe(true);
    expect(limiter.isLimited('203.0.113.7', new Date('2026-09-22T00:15:00.001Z'))).toBe(false);
  });
});
