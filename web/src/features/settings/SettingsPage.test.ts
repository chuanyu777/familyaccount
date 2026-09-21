import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { cachedGet, apiPut, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import SettingsPage from './SettingsPage.vue';

vi.mock('../../lib/api', () => {
  class ApiErrorImpl extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    cachedGet: vi.fn(),
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    invalidate: vi.fn(),
    ApiError: ApiErrorImpl,
  };
});

const mockedCachedGet = vi.mocked(cachedGet);
const mockedApiPut = vi.mocked(apiPut);
const mockedApiPost = vi.mocked(apiPost);
const mockedApiPatch = vi.mocked(apiPatch);
const mockedApiDelete = vi.mocked(apiDelete);

const family = { id: 1, name: '我的家' };
const members = [{ id: 1, name: '我', color: null }];

let wrapper: ReturnType<typeof mount> | null = null;

function setupCache() {
  mockedCachedGet.mockImplementation((path: string) => {
    if (path.includes('family')) return Promise.resolve(family as never);
    if (path.includes('members')) return Promise.resolve(members as never);
    return Promise.resolve(undefined as never);
  });
}

// —— DOM 辅助（ConfirmDialog 经 Teleport 渲染到 body）——
function findBtn(label: string, scope: ParentNode = document.body): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === label,
    ) ?? null
  );
}
function clickBtn(label: string, scope: ParentNode = document.body) {
  const btn = findBtn(label, scope);
  if (!btn) throw new Error(`button not found: ${label}`);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
function fieldInput(label: string, scope: ParentNode = document.body): HTMLInputElement | null {
  const labels = Array.from(scope.querySelectorAll('label, .field'));
  for (const l of labels) {
    const span = l.querySelector('.field__label');
    if (span && (span.textContent ?? '').trim().includes(label)) {
      return (l.querySelector('input, select') as HTMLInputElement) ?? null;
    }
  }
  return null;
}
function setInput(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
function dialogByTitle(title: string): HTMLElement {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find((node) =>
    (node.textContent ?? '').includes(title),
  );
  if (!dialog) throw new Error(`dialog not found: ${title}`);
  return dialog;
}

async function settle() {
  await flushPromises();
  await flushPromises();
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
  setupCache();
  wrapper = null;
  mockedApiPut.mockResolvedValue(family as never);
  mockedApiPost.mockResolvedValue(undefined);
  mockedApiPatch.mockResolvedValue(undefined);
  mockedApiDelete.mockResolvedValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('设置页 · 家庭名称', () => {
  it('展示并允许修改家庭名称，保存调 PUT /api/family', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const input = fieldInput('家庭名称');
    expect(input?.value).toBe('我的家');
    setInput(input!, '新家');
    clickBtn('保存');
    await settle();
    expect(mockedApiPut).toHaveBeenCalledWith('/api/family', { name: '新家' });
    expect(document.body.textContent).toContain('已保存');
  });

  it('保存失败时保留用户输入', async () => {
    mockedApiPut.mockRejectedValueOnce(new ApiError(500, 'SAVE_FAILED', '保存失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    setInput(fieldInput('家庭名称')!, '新家');
    clickBtn('保存');
    await settle();
    expect((fieldInput('家庭名称') as HTMLInputElement).value).toBe('新家');
    expect(document.body.textContent).toContain('保存失败');
  });

  it('空家庭名称不提交', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    setInput(fieldInput('家庭名称')!, '   ');
    clickBtn('保存');
    await settle();
    expect(mockedApiPut).not.toHaveBeenCalled();
  });
});

describe('设置页 · 成员列表', () => {
  it('展示成员列表', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('我');
  });

  it('使用安静分组行，并从整行打开成员编辑弹层', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const row = document.querySelector('[data-member-row="1"]') as HTMLButtonElement;
    expect(row).toBeTruthy();
    row.click();
    await settle();
    expect(dialogByTitle('编辑成员')).toBeTruthy();
  });

  it('新增成员未选颜色时保留 null payload', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtn('添加成员');
    await settle();
    const dialog = dialogByTitle('添加成员');
    setInput(fieldInput('成员姓名', dialog)!, '妈妈');
    clickBtn('添加', dialog);
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/members', { name: '妈妈', color: null });
  });

  it('新增成员保留选择的颜色 payload', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtn('添加成员');
    await settle();
    const dialog = dialogByTitle('添加成员');
    setInput(fieldInput('成员姓名', dialog)!, '妈妈');
    setInput(fieldInput('成员颜色', dialog)!, '#3159d7');
    clickBtn('添加', dialog);
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/members', { name: '妈妈', color: '#3159d7' });
  });

  it('新增失败时保留弹层和表单输入', async () => {
    mockedApiPost.mockRejectedValueOnce(new ApiError(500, 'CREATE_FAILED', '添加失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtn('添加成员');
    await settle();
    const dialog = dialogByTitle('添加成员');
    setInput(fieldInput('成员姓名', dialog)!, '妈妈');
    clickBtn('添加', dialog);
    await settle();
    expect(dialogByTitle('添加成员')).toBeTruthy();
    expect(fieldInput('成员姓名', dialog)?.value).toBe('妈妈');
    expect(dialog.textContent).toContain('添加失败');
  });

  it('可在弹层改名成员，调 PATCH /api/members/:id', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    const dialog = dialogByTitle('编辑成员');
    setInput(fieldInput('成员姓名', dialog)!, '阿爸');
    clickBtn('保存', dialog);
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/members/1', { name: '阿爸' });
  });

  it('编辑失败时保留弹层和表单输入', async () => {
    mockedApiPatch.mockRejectedValueOnce(new ApiError(500, 'UPDATE_FAILED', '修改失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    const dialog = dialogByTitle('编辑成员');
    setInput(fieldInput('成员姓名', dialog)!, '阿爸');
    clickBtn('保存', dialog);
    await settle();
    expect(dialogByTitle('编辑成员')).toBeTruthy();
    expect(fieldInput('成员姓名', dialog)?.value).toBe('阿爸');
    expect(dialog.textContent).toContain('修改失败');
  });

  it('空姓名不提交成员编辑', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    const dialog = dialogByTitle('编辑成员');
    setInput(fieldInput('成员姓名', dialog)!, '   ');
    clickBtn('保存', dialog);
    await settle();
    expect(mockedApiPatch).not.toHaveBeenCalled();
  });

  it('空姓名不提交新增', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtn('添加成员');
    await settle();
    clickBtn('添加', dialogByTitle('添加成员'));
    await settle();
    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('关闭成员弹层后通过共享遮罩恢复整行焦点', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const row = document.querySelector('[data-member-row="1"]') as HTMLButtonElement;
    row.focus();
    row.click();
    await settle();
    clickBtn('关闭', dialogByTitle('编辑成员'));
    await settle();
    expect(document.activeElement).toBe(row);
  });
});

describe('设置页 · 删除二次确认', () => {
  it('删除需二次确认，确认后才调用删除', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    clickBtn('删除成员', dialogByTitle('编辑成员'));
    await settle();
    const dialog = dialogByTitle('删除成员「我」？');
    expect(mockedApiDelete).not.toHaveBeenCalled();
    clickBtn('删除', dialog);
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/members/1');
  });

  it('二次确认时取消则不删除', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    clickBtn('删除成员', dialogByTitle('编辑成员'));
    await settle();
    const dialog = dialogByTitle('删除成员「我」？');
    clickBtn('取消', dialog);
    await settle();
    expect(mockedApiDelete).not.toHaveBeenCalled();
    expect(dialogByTitle('编辑成员')).toBeTruthy();
  });

  it('使用完整的家庭归属说明', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain(
      '删除成员后，其名下的账目、资产、负债会自动转为「家庭共有」，不会被一并删除。',
    );
  });

  it('删除失败时保留确认弹层并显示错误', async () => {
    mockedApiDelete.mockRejectedValueOnce(new ApiError(500, 'DELETE_FAILED', '删除失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    (document.querySelector('[data-member-row="1"]') as HTMLButtonElement).click();
    await settle();
    clickBtn('删除成员', dialogByTitle('编辑成员'));
    await settle();
    clickBtn('删除', dialogByTitle('删除成员「我」？'));
    await settle();
    expect(dialogByTitle('删除成员「我」？').textContent).toContain('删除失败');
  });
});

describe('设置页 · 失败降级', () => {
  it('家庭读取失败不清除成功加载的成员', async () => {
    mockedCachedGet.mockImplementation((path: string) => {
      if (path.includes('family')) return Promise.reject(new Error('家庭加载失败'));
      return Promise.resolve(members as never);
    });
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('家庭加载失败');
    expect(document.querySelector('[data-member-row="1"]')).toBeTruthy();
  });

  it('刷新读取失败时保留之前成功的数据', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    mockedCachedGet.mockImplementation((path: string) => {
      if (path.includes('family')) return Promise.reject(new Error('家庭刷新失败'));
      if (path.includes('members')) return Promise.reject(new Error('成员刷新失败'));
      return Promise.resolve(undefined as never);
    });
    publishResources(['family']);
    publishResources(['members']);
    await settle();
    expect(fieldInput('家庭名称')?.value).toBe('我的家');
    expect(document.querySelector('[data-member-row="1"]')).toBeTruthy();
    expect(document.body.textContent).toContain('家庭刷新失败');
    expect(document.body.textContent).toContain('成员刷新失败');
  });

  it('分别订阅家庭和成员资源', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    mockedCachedGet.mockClear();

    publishResources(['family']);
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledTimes(1);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/family', undefined, { force: true });

    mockedCachedGet.mockClear();
    publishResources(['members']);
    await settle();
    expect(mockedCachedGet).toHaveBeenCalledTimes(1);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/members', undefined, { force: true });
  });
});
