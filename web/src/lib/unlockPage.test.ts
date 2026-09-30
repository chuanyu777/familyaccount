import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const unlockPage = readFileSync(resolve(process.cwd(), 'web/public/unlock.html'), 'utf8');
describe('retired unlock page', () => {
  it('does not contain the shared access-code form or endpoint', () => {
    expect(unlockPage).not.toContain('unlock-form');
    expect(unlockPage).not.toContain('/api/access/unlock');
    expect(unlockPage).toContain("window.location.replace('/ledger')");
  });
});
