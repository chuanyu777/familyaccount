import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AppSheet from './AppSheet.vue';
import ConfirmDialog from './ConfirmDialog.vue';

const baseCss = readFileSync(resolve(process.cwd(), 'web/src/styles/base.css'), 'utf8');
const wrappers: VueWrapper[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = 'auto';
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

function mountSheet(slots: Record<string, string> = {}): VueWrapper {
  const wrapper = mount(AppSheet, {
    attachTo: document.body,
    props: { title: '记一笔' },
    slots,
  });
  wrappers.push(wrapper);
  return wrapper;
}

function mountConfirm(): VueWrapper {
  const wrapper = mount(ConfirmDialog, {
    attachTo: document.body,
    props: { title: '删除还款' },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe('AppSheet', () => {
  it('closes a sheet with Escape and restores focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mountSheet();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    expect(document.activeElement).toBe(opener);
  });

  it('labels the dialog from its heading and focuses the first control', async () => {
    mountSheet({ default: '<button type="button">保存</button>' });
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    const heading = document.body.querySelector<HTMLElement>('.sheet__title')!;
    expect(heading.id).not.toBe('');
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(dialog.hasAttribute('aria-label')).toBe(false);
    expect(document.activeElement).toBe(document.body.querySelector('.sheet__close'));
  });

  it('locks page scrolling while mounted and restores the prior value', () => {
    document.body.style.overflow = 'clip';
    const wrapper = mountSheet();

    expect(document.body.style.overflow).toBe('hidden');
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    expect(document.body.style.overflow).toBe('clip');
  });

  it('wraps Tab focus within the sheet', async () => {
    mountSheet({ default: '<button type="button" class="last-action">保存</button>' });
    await flushPromises();
    const first = document.body.querySelector<HTMLElement>('.sheet__close')!;
    const last = document.body.querySelector<HTMLElement>('.last-action')!;

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  it('keeps the close and default-slot contracts', async () => {
    const wrapper = mountSheet({ default: '<p>表单内容</p>' });

    expect(document.body.textContent).toContain('表单内容');
    document.body.querySelector<HTMLButtonElement>('.sheet__close')!.click();
    await Promise.resolve();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('uses the required mobile and desktop sheet geometry', () => {
    expect(baseCss).toMatch(/\.sheet\s*{[^}]*width:\s*100%;[^}]*max-height:\s*calc\(100dvh - 58px\);[^}]*border-radius:\s*14px 14px 0 0;/s);
    expect(baseCss).toMatch(/\.sheet__close\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
    expect(baseCss).toMatch(/@media \(min-width:\s*768px\)\s*{[\s\S]*?\.overlay\s*{[^}]*align-items:\s*center;[^}]*padding:\s*24px;[^}]*}[\s\S]*?\.sheet\s*{[^}]*max-width:\s*520px;[^}]*max-height:\s*min\(760px, calc\(100dvh - 48px\)\);[^}]*border-radius:\s*8px;[^}]*}[\s\S]*?\.sheet__grip\s*{[^}]*display:\s*none;/s);
  });

  it('coordinates Escape, scroll locking, and focus across nested overlays', async () => {
    document.body.style.overflow = 'clip';
    const pageOpener = document.createElement('button');
    document.body.append(pageOpener);
    pageOpener.focus();
    const sheet = mountSheet({
      default: '<button type="button" class="repayment-delete">删除还款</button>',
    });
    await flushPromises();
    const repaymentDelete = document.body.querySelector<HTMLButtonElement>('.repayment-delete')!;
    repaymentDelete.focus();

    const dialog = mountConfirm();
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialog.emitted('cancel')).toHaveLength(1);
    expect(sheet.emitted('close')).toBeUndefined();
    dialog.unmount();
    wrappers.splice(wrappers.indexOf(dialog), 1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(repaymentDelete);

    const secondDialog = mountConfirm();
    await flushPromises();
    const dialogCancel = document.activeElement;
    sheet.unmount();
    wrappers.splice(wrappers.indexOf(sheet), 1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(dialogCancel);

    secondDialog.unmount();
    wrappers.splice(wrappers.indexOf(secondDialog), 1);
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(pageOpener);
  });
});

describe('ConfirmDialog', () => {
  it('shares focus management and accessible heading labeling', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      props: { title: '删除记录' },
    });
    wrappers.push(wrapper);
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('.dialog')!;
    const heading = dialog.querySelector<HTMLElement>('.dialog__title')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(document.activeElement?.textContent).toBe('取消');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    expect(document.activeElement).toBe(opener);
  });
});
