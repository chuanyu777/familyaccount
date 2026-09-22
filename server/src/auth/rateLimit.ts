const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export class FailedAttemptLimiter {
  private readonly attemptsByIp = new Map<string, number[]>();

  isLimited(ip: string, now: Date): boolean {
    return this.activeAttempts(ip, now).length >= MAX_FAILED_ATTEMPTS;
  }

  recordFailure(ip: string, now: Date): void {
    const attempts = this.activeAttempts(ip, now);
    attempts.push(now.getTime());
    this.attemptsByIp.set(ip, attempts);
  }

  private activeAttempts(ip: string, now: Date): number[] {
    const cutoff = now.getTime() - WINDOW_MS;
    const attempts = (this.attemptsByIp.get(ip) ?? []).filter((attemptedAt) => attemptedAt > cutoff);

    if (attempts.length === 0) {
      this.attemptsByIp.delete(ip);
    } else {
      this.attemptsByIp.set(ip, attempts);
    }

    return attempts;
  }
}
