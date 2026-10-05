import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { apiDelete, apiPatch, apiPost, cachedGet } from '../../lib/api';
import SettingsPage from './SettingsPage.vue';

vi.mock('../../lib/api', () => ({
  cachedGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
}));

const mockedCachedGet = vi.mocked(cachedGet);
const mockedApiPost = vi.mocked(apiPost);
const mockedApiPatch = vi.mocked(apiPatch);
const mockedApiDelete = vi.mocked(apiDelete);
const ledger = { id: 9, name: '共享账本', role: 'OWNER', active: true, webLoginAllowed: true };
const members = [
  { id: 1, ledgerId: 9, userId: 7, role: 'OWNER', active: true, displayName: '所有者' },
  { id: 2, ledgerId: 9, userId: 8, role: 'MEMBER', active: true, displayName: '成员' },
];
const categories = [{ id: 1, kind: 'expense' as const, name: '餐饮', archived: false }];

function setup() {
  mockedCachedGet.mockImplementation((path: string) => {
    if (path === '/api/ledgers') return Promise.resolve([ledger]);
    if (path.includes('/members')) return Promise.resolve(members);
    return Promise.resolve(categories.map((category) => ({ ...category })));
  });
  mockedApiPatch.mockResolvedValue({ ...ledger, name: '新账本' } as never);
  mockedApiPost.mockResolvedValue({ id: 42, ledgerId: 9, token: 'invite-token', expiresAt: '2026-10-12 12:00:00' } as never);
  mockedApiDelete.mockResolvedValue(undefined as never);
}

async function settle() { await flushPromises(); await flushPromises(); }

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); setup(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('SettingsPage ledger context', () => {
  it('retains invitation metadata and lets only the owner revoke it', async () => {
    const wrapper = mount(SettingsPage, { props: { permissions: { isOwner: true, canManageMembers: true } } });
    await settle();
    await wrapper.findAll('button').find((button) => button.text() === '生成邀请')!.trigger('click');
    await settle();
    expect(wrapper.text()).toContain('invite-token');
    expect(wrapper.text()).toContain('2026-10-12 12:00:00');
    await wrapper.findAll('button').find((button) => button.text() === '撤销邀请')!.trigger('click');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/invitations/42/revoke', {});
    expect(wrapper.text()).not.toContain('invite-token');
    expect(wrapper.text()).not.toContain('撤销邀请');
    wrapper.unmount();
  });

  it('keeps a failed revocation retryable and hides it when owner permissions are lost', async () => {
    const wrapper = mount(SettingsPage, { props: { permissions: { isOwner: true, canManageMembers: true } } });
    await settle();
    await wrapper.findAll('button').find((button) => button.text() === '生成邀请')!.trigger('click');
    await settle();
    mockedApiPost.mockRejectedValueOnce(new Error('撤销失败'));
    await wrapper.findAll('button').find((button) => button.text() === '撤销邀请')!.trigger('click');
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toBe('撤销失败');
    expect(wrapper.text()).toContain('invite-token');
    await wrapper.setProps({ permissions: { isOwner: false, canManageMembers: false } });
    expect(wrapper.text()).not.toContain('撤销邀请');
    wrapper.unmount();
  });

  it('loads the fixed ledger and membership endpoints without legacy family reads', async () => {
    const wrapper = mount(SettingsPage, { props: { session: { type: 'LEDGER_USER', userId: 7 }, permissions: { isOwner: true } }, attachTo: document.body });
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/ledgers', undefined, { force: false });
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/ledgers/9/members', undefined, { force: false });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/family', undefined, expect.anything());
    expect((wrapper.get('[aria-label="账本名称"]').element as HTMLInputElement).value).toBe('共享账本');
  });

  it('shows ledger management controls only to the owner', async () => {
    const owner = mount(SettingsPage, { props: { permissions: { isOwner: true, canManageMembers: true, canRenameLedger: true, canArchiveResources: true } }, attachTo: document.body });
    await settle();
    expect(owner.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
    expect(owner.text()).toContain('生成邀请');
    owner.unmount();

    const member = mount(SettingsPage, { props: { permissions: { isOwner: false, canManageMembers: false, canRenameLedger: false, canArchiveResources: false } }, attachTo: document.body });
    await settle();
    expect(member.text()).not.toContain('生成邀请');
    expect(member.text()).not.toContain('归档');
    expect(member.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('renames the ledger and archives categories through ledger-scoped APIs', async () => {
    const wrapper = mount(SettingsPage, { props: { permissions: { isOwner: true, canManageMembers: true, canRenameLedger: true, canArchiveResources: true } }, attachTo: document.body });
    await settle();
    await wrapper.get('[aria-label="账本名称"]').setValue('新账本');
    await wrapper.get('button[type="submit"]').trigger('click');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/ledgers/9', { name: '新账本' });
    await wrapper.findAll('[aria-labelledby="categories-heading"] .settings-row button').find((button) => button.text() === '归档')!.trigger('click');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/categories/1/archive', {});
  });

  it('lets members create income categories and edit active categories', async () => {
    mockedApiPost.mockResolvedValue({ id: 2, kind: 'income', name: '奖金', archived: false } as never);
    mockedApiPatch.mockResolvedValue({ id: 1, kind: 'expense', name: '餐饮改名', archived: false } as never);
    const wrapper = mount(SettingsPage, { props: { permissions: { isOwner: false, canManageMembers: false, canRenameLedger: false, canArchiveResources: false } }, attachTo: document.body });
    await settle();

    await wrapper.get('[aria-label="新分类类型"]').setValue('income');
    await wrapper.get('[aria-label="新分类名称"]').setValue('奖金');
    await wrapper.get('[aria-labelledby="categories-heading"] form').trigger('submit');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/categories', { kind: 'income', name: '奖金' });

    const activeCategoryRow = wrapper.findAll('[aria-labelledby="categories-heading"] .settings-row').find((row) => row.text().includes('餐饮') && !row.text().includes('已归档'))!;
    await activeCategoryRow.find('button').trigger('click');
    await wrapper.get('[aria-label="编辑分类 餐饮"]').setValue('餐饮改名');
    await wrapper.findAll('[aria-labelledby="categories-heading"] button').find((button) => button.text() === '保存')!.trigger('click');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/categories/1', { name: '餐饮改名' });
  });
});
