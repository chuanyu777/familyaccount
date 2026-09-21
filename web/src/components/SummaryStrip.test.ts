import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SummaryStrip from './SummaryStrip.vue';

describe('SummaryStrip', () => {
  it('renders cents through MoneyText with the requested tones', () => {
    const wrapper = mount(SummaryStrip, {
      props: {
        primary: { label: '本月结余', cents: 123456, tone: 'income' },
        secondary: [
          { label: '收入', cents: 300000, tone: 'income' },
          { label: '支出', cents: -176544, tone: 'expense' },
        ],
      },
    });

    expect(wrapper.get('.summary-strip__primary').text()).toContain('本月结余');
    expect(wrapper.get('.summary-strip__primary .money').text()).toBe('¥1,234.56');
    expect(wrapper.get('.summary-strip__primary .money').classes()).toContain('money--income');
    expect(wrapper.findAll('.summary-strip__secondary')).toHaveLength(2);
    expect(wrapper.text()).toContain('¥3,000.00');
    expect(wrapper.text()).toContain('-¥1,765.44');
  });

  it('renders at most two secondary metrics', () => {
    const wrapper = mount(SummaryStrip, {
      props: {
        primary: { label: '净资产', cents: 10000 },
        secondary: [
          { label: '账户', cents: 4000 },
          { label: '资产', cents: 6000 },
          { label: '不应显示', cents: 9000 },
        ],
      },
    });

    expect(wrapper.findAll('.summary-strip__secondary')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('不应显示');
  });
});
