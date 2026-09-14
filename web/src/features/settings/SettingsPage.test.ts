import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { cachedGet, apiPut, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
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
function findBtnAria(label: string, scope: ParentNode = document.body): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll('button')).find(
      (b) => (b.getAttribute('aria-label') ?? '').trim() === label,
    ) ?? null
  );
}
function clickBtnAria(label: string, scope: ParentNode = document.body) {
  const btn = findBtnAria(label, scope);
  if (!btn) throw new Error(`button[aria-label] not found: ${label}`);
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
function liByText(text: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll('li')).find((li) =>
      (li.textContent ?? '').includes(text),
    ) ?? null
  );
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
});

describe('设置页 · 成员列表', () => {
  it('展示成员列表', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('我');
  });

  it('可新增成员（只需姓名，颜色可选）', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const input = fieldInput('成员姓名');
    setInput(input!, '妈妈');
    clickBtn('添加成员');
    await settle();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/members', { name: '妈妈', color: null });
  });

  it('可改名成员，调 PATCH /api/members/:id', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const row = liByText('我');
    expect(row).not.toBeNull();
    clickBtnIn(row!, '改名');
    await settle();
    const nameInput = row!.querySelector('input[aria-label="成员 我 名称"]') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    setInput(nameInput!, '阿爸');
    clickBtnIn(row!, '保存');
    await settle();
    expect(mockedApiPatch).toHaveBeenCalledWith('/api/members/1', { name: '阿爸' });
  });

  it('空姓名不提交新增', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtn('添加成员');
    await settle();
    expect(mockedApiPost).not.toHaveBeenCalled();
  });
});

describe('设置页 · 删除二次确认', () => {
  it('删除需二次确认，确认后才调用删除', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtnAria('删除成员 我');
    await settle();
    const dialog = document.querySelector('.dialog');
    expect(dialog).not.toBeNull();
    expect(mockedApiDelete).not.toHaveBeenCalled();
    clickBtn('删除', dialog!);
    await settle();
    expect(mockedApiDelete).toHaveBeenCalledWith('/api/members/1');
  });

  it('二次确认时取消则不删除', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    clickBtnAria('删除成员 我');
    await settle();
    const dialog = document.querySelector('.dialog');
    expect(dialog).not.toBeNull();
    clickBtn('取消', dialog!);
    await settle();
    expect(mockedApiDelete).not.toHaveBeenCalled();
  });

  it('说明文案提到删除后转为家庭共有', async () => {
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('家庭共有');
  });
});

describe('设置页 · 失败降级', () => {
  it('接口异常时显示错误提示而不崩溃', async () => {
    mockedCachedGet.mockRejectedValue(new Error('加载失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    expect(document.body.textContent).toContain('加载失败');
  });

  it('保存失败时显示错误提示不崩', async () => {
    mockedApiPut.mockRejectedValueOnce(new ApiError(500, 'E', '保存失败'));
    wrapper = mount(SettingsPage, { attachTo: document.body });
    await settle();
    const input = fieldInput('家庭名称');
    setInput(input!, '新家');
    clickBtn('保存');
    await settle();
    expect(document.body.textContent).toContain('保存失败');
  });
});

function clickBtnIn(scope: ParentNode, label: string) {
  clickBtn(label, scope);
}
