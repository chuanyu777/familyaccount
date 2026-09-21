import { expect, it } from 'vitest';

import { createLatestGate } from './latestGate';

it('marks an older request stale when a newer request finishes first', async () => {
  const gate = createLatestGate();
  let release!: (value: string) => void;
  const old = gate.run(() => new Promise<string>((resolve) => { release = resolve; }));
  const fresh = await gate.run(async () => 'fresh');
  release('old');
  expect(fresh).toEqual({ current: true, value: 'fresh' });
  await expect(old).resolves.toEqual({ current: false, value: 'old' });
});
