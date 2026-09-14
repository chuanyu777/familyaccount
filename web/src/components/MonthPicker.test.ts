import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import MonthPicker from './MonthPicker.vue';
import { currentMonth, monthLabel, shiftMonth } from '../lib/format';

const MAX = '2026-09';

let wrapper: VueWrapper | null = null;

function mountPicker(modelValue = MAX): VueWrapper {
  wrapper = mount(MonthPicker, {
    props: { modelValue, max: MAX },
    attachTo: document.body,
  });
  return wrapper;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('MonthPicker', () => {
  it('展示当前月份标签', () => {
    const w = mountPicker('2026-03');
    expect(w.text()).toContain('2026年3月');
  });

  it('左右箭头按月步进', async () => {
    const w = mountPicker('2026-03');
    await w.get('[aria-label="上一月"]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['2026-02']);
    await w.get('[aria-label="下一月"]').trigger('click');
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['2026-04']);
  });

  it('到达最大月份后「下一月」禁用', () => {
    const w = mountPicker(MAX);
    const next = w.get('[aria-label="下一月"]');
    expect(next.attributes('disabled')).toBeDefined();
  });

  it('跨年步进正确', async () => {
    const w = mountPicker('2026-01');
    await w.get('[aria-label="上一月"]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['2025-12']);
  });

  it('点标题弹出月份宫格，点某月即选中', async () => {
    const w = mountPicker('2026-03');
    await w.get('[aria-label="选择月份"]').trigger('click');
    const cells = document.body.querySelectorAll('.picker__cell');
    expect(cells).toHaveLength(12);

    // 8 月 = 索引 7
    (cells[7] as HTMLElement).click();
    await Promise.resolve();
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['2026-08']);
  });

  it('未来月份在宫格里不可选', async () => {
    mountPicker('2026-03');
    await wrapper!.get('[aria-label="选择月份"]').trigger('click');
    const cells = document.body.querySelectorAll('.picker__cell');
    // 2026-09 是上限可选，10/11/12 月应禁用
    expect((cells[8] as HTMLButtonElement).disabled).toBe(false);
    expect((cells[9] as HTMLButtonElement).disabled).toBe(true);
    expect((cells[11] as HTMLButtonElement).disabled).toBe(true);
  });

  it('切到上一年后所有月份都可选', async () => {
    const w = mountPicker('2026-03');
    await w.get('[aria-label="选择月份"]').trigger('click');
    await document.body.querySelector<HTMLElement>('[aria-label="上一年"]')!.click();
    await Promise.resolve();
    const cells = document.body.querySelectorAll('.picker__cell');
    expect((cells[11] as HTMLButtonElement).disabled).toBe(false);
  });

  it('快捷「本月」跳到当前月', async () => {
    const w = mountPicker('2026-01');
    await w.get('[aria-label="选择月份"]').trigger('click');
    const quick = [...document.body.querySelectorAll('.picker__quick button')];
    const thisMonthBtn = quick.find((b) => b.textContent?.trim() === '本月');
    (thisMonthBtn as HTMLElement).click();
    await Promise.resolve();
    expect(w.emitted('update:modelValue')?.[0]).toEqual([currentMonth()]);
  });

  it('选中月份与当前月一致的宫格格高亮', async () => {
    mountPicker(MAX);
    await wrapper!.get('[aria-label="选择月份"]').trigger('click');
    const active = document.body.querySelector('.picker__cell.is-active');
    expect(active?.textContent?.trim()).toBe('9 月');
  });

  it('emit 的月份可供 monthLabel 正常渲染', () => {
    expect(monthLabel(shiftMonth('2026-01', -1))).toBe('2025年12月');
  });
});
