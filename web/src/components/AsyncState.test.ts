import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AsyncState from './AsyncState.vue';

describe('AsyncState', () => {
  it('shows retry without discarding slotted stale content', async () => {
    const wrapper = mount(AsyncState, {
      props: { loading: false, error: '加载失败', empty: false },
      slots: { default: '<p>旧数据</p>' },
    });

    expect(wrapper.text()).toContain('旧数据');
    expect(wrapper.text()).toContain('加载失败');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('shows four skeleton rows only when loading without data', () => {
    const wrapper = mount(AsyncState, {
      props: { loading: true, error: '', empty: true },
      slots: { default: '<p>不应显示</p>' },
    });

    expect(wrapper.get('[aria-label="加载中"]').classes()).toContain('skeleton-list');
    expect(wrapper.findAll('.skeleton-list__row')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('不应显示');
  });

  it('shows an empty error with retry instead of the empty state', async () => {
    const wrapper = mount(AsyncState, {
      props: {
        loading: false,
        error: '暂时无法加载',
        empty: true,
        emptyTitle: '还没有记录',
      },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法加载');
    expect(wrapper.text()).not.toContain('还没有记录');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('forwards empty copy to EmptyState when there is no data', () => {
    const wrapper = mount(AsyncState, {
      props: {
        loading: false,
        error: '',
        empty: true,
        emptyTitle: '还没有记录',
        emptyHint: '新增一笔后会显示在这里',
      },
    });

    expect(wrapper.text()).toContain('还没有记录');
    expect(wrapper.text()).toContain('新增一笔后会显示在这里');
  });
});
