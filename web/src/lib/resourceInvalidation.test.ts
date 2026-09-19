import { expect, it } from 'vitest';

import { publishResources, resourceVersion, resourcesForMutation } from './resourceInvalidation';

it('maps a repayment mutation to every affected resource', () => {
  expect(resourcesForMutation('/api/repayments', 'POST')).toEqual([
    'repayments', 'transactions', 'accounts', 'liabilities', 'statistics',
  ]);
});

it('includes rollback dependencies when deleting a liability', () => {
  expect(resourcesForMutation('/api/liabilities/1', 'DELETE')).toEqual([
    'liabilities', 'repayments', 'transactions', 'accounts', 'statistics',
  ]);
});

it('does not refresh family data after an asset mutation', () => {
  const before = resourceVersion(['family']).value;
  publishResources(resourcesForMutation('/api/assets', 'PATCH'));
  expect(resourceVersion(['family']).value).toBe(before);
});
