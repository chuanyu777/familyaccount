import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/errors';

describe('invitation page error mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('Page', vi.fn());
  });

  it('shows the backend-supported invalid invitation state without guessing its cause', async () => {
    const { invitationError } = await import('./detail');

    expect(invitationError(new ApiError(409, 'INVITATION_INVALID', '后端详情')))
      .toBe('邀请无效或已失效');
  });

  it('does not map nonexistent invitation error codes to a membership state', async () => {
    const { invitationError } = await import('./detail');

    expect(invitationError(new ApiError(409, 'ALREADY_MEMBER', '后端详情')))
      .toBe('后端详情');
    expect(invitationError(new ApiError(409, 'INVITATION_ALREADY_USED', '后端详情')))
      .toBe('后端详情');
  });

  it('distinguishes missing token, network, and server errors', async () => {
    const { invitationError } = await import('./detail');

    expect(invitationError(undefined, true)).toBe('请输入邀请口令');
    expect(invitationError(new Error('网络连接失败')))
      .toBe('网络请求失败，请检查网络后重试');
    expect(invitationError(new ApiError(500, 'INTERNAL_ERROR', '服务暂时不可用')))
      .toBe('服务暂时不可用，请稍后重试');
  });
});
