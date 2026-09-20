import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { apiPatch, apiPost, ApiError } from '../../lib/api';
import { todayISO } from '../../lib/format';
import TransactionForm from './TransactionForm.vue';
import type { Account, Category, Member } from './types';

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
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    ApiError: ApiErrorImpl,
  };
});

const mockedApiPost = vi.mocked(apiPost) as unknown as Mock;
const mockedApiPatch = vi.mocked(apiPatch) as unknown as Mock;

const accounts: Account[] = [
  { id: 1, name: '现金', balance: 0, balance_cents: 0, is_default: false },
  { id: 2, name: '微信', balance: 0, balance_cents: 0, is_default: true },
];
const members: Member[] = [
  { id: 2, name: '伴侣' },
  { id: 1, name: '我' },
];
const expenseCategories: Category[] = [
  { id: 10, kind: 'expense', name: '餐饮' },
  { id: 11, kind: 'expense', name: '其他' },
];
const incomeCategories: Category[] = [
  { id: 20, kind: 'income', name: '工资' },
  { id: 21, kind: 'income', name: '其他收入' },
];

const baseProps = {
  mode: 'create' as const,
  accounts,
  members,
  expenseCategories,
  incomeCategories,
};

let wrapper: VueWrapper | null = null;

function mountForm() {
  wrapper = mount(TransactionForm, { props: baseProps, attachTo: document.body });
  return wrapper;
}

function input(label: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!element) throw new Error(`input not found: ${label}`);
  return element;
}

function select(label: string): HTMLSelectElement {
  const element = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!element) throw new Error(`select not found: ${label}`);
  return element;
}

async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  element.value = value;
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  await flushPromises();
}

function button(label: string): HTMLButtonElement {
  const element = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!element) throw new Error(`button not found: ${label}`);
  return element;
}

function submit(): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>('[data-submit-transaction]');
  if (!element) throw new Error('transaction submit not found');
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
  mockedApiPost.mockReset();
  mockedApiPatch.mockReset();
  mockedApiPost.mockResolvedValue(undefined);
  mockedApiPatch.mockResolvedValue(undefined);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('TransactionForm', () => {
  it('keeps the form open and preserves input after a failed save', async () => {
    mockedApiPost.mockRejectedValueOnce(new ApiError(500, 'SAVE_FAILED', '保存失败'));
    const form = mountForm();
    await setValue(input('金额'), '186');
    submit().click();
    await flushPromises();

    expect(document.body.textContent).toContain('保存失败');
    expect(input('金额').value).toBe('186');
    expect(document.querySelector('.sheet')).not.toBeNull();
    expect(form.emitted('saved')).toBeUndefined();
  });

  it('stays open and shows pending copy until the financial write resolves', async () => {
    let resolveSave!: () => void;
    mockedApiPost.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const form = mountForm();
    await setValue(input('金额'), '186');
    submit().click();
    await flushPromises();

    expect(submit().textContent?.trim()).toBe('保存中…');
    expect(submit().disabled).toBe(true);
    expect(document.querySelector('.sheet')).not.toBeNull();
    expect(form.emitted('saved')).toBeUndefined();

    resolveSave();
    await flushPromises();
    expect(form.emitted('saved')).toHaveLength(1);
  });

  it('ignores Escape, backdrop and close button during a pending write, then permits closing after failure', async () => {
    let rejectSave!: (reason: Error) => void;
    mockedApiPost.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    }));
    const form = mountForm();
    await setValue(input('金额'), '186');
    submit().click();
    await flushPromises();
    expect(submit().textContent?.trim()).toBe('保存中…');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector<HTMLElement>('.overlay')!.click();
    document.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    await flushPromises();
    expect(form.emitted('close')).toBeUndefined();
    expect(document.querySelector('.sheet')).not.toBeNull();

    rejectSave(new ApiError(500, 'SAVE_FAILED', '保存失败'));
    await flushPromises();
    expect(input('金额').value).toBe('186');
    expect(document.querySelector('.sheet')?.textContent).toContain('保存失败');
    expect(form.emitted('saved')).toBeUndefined();

    document.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    expect(form.emitted('close')).toHaveLength(1);
  });

  it('uses the named defaults and preserves the expense payload', async () => {
    mountForm();
    await setValue(input('金额'), '186');
    await setValue(input('备注'), '家庭晚餐');
    submit().click();
    await flushPromises();

    expect(mockedApiPost).toHaveBeenCalledWith('/api/transactions', {
      type: 'expense',
      amount: 186,
      occurredOn: todayISO(),
      note: '家庭晚餐',
      memberId: 1,
      accountId: 2,
      categoryId: 11,
      categoryName: '其他',
    });
  });

  it('requires a distinct destination and preserves the transfer payload', async () => {
    mountForm();
    button('转账').click();
    await flushPromises();
    await setValue(input('金额'), '88.50');
    await setValue(select('转入账户'), '2');
    await flushPromises();
    expect(submit().disabled).toBe(true);
    expect(mockedApiPost).not.toHaveBeenCalled();

    await setValue(select('转入账户'), '1');
    submit().click();
    await flushPromises();
    expect(mockedApiPost).toHaveBeenCalledWith('/api/transactions', {
      type: 'transfer',
      amount: 88.5,
      occurredOn: todayISO(),
      note: undefined,
      memberId: 1,
      accountId: 2,
      toAccountId: 1,
    });
  });

  it('creates and selects an inline category for the eventual payload', async () => {
    const created: Category = { id: 12, kind: 'expense', name: '宠物' };
    mockedApiPost.mockResolvedValueOnce(created).mockResolvedValueOnce(undefined);
    const form = mountForm();
    document.querySelector<HTMLButtonElement>('.cat--new')!.click();
    await flushPromises();
    await setValue(input('新建分类名称'), '宠物');
    await flushPromises();
    button('添加').click();
    await flushPromises();

    expect(mockedApiPost).toHaveBeenNthCalledWith(1, '/api/categories', {
      kind: 'expense',
      name: '宠物',
    });
    expect(form.emitted('created-category')).toEqual([[created]]);

    await setValue(input('金额'), '60');
    submit().click();
    await flushPromises();
    expect(mockedApiPost).toHaveBeenNthCalledWith(
      2,
      '/api/transactions',
      expect.objectContaining({ categoryId: 12, categoryName: '宠物' }),
    );
  });
});
