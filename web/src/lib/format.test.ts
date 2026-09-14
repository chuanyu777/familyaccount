import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  centsToInput,
  todayISO,
  currentMonth,
  monthLabel,
  shiftMonth,
  dayLabel,
} from './format';

describe('formatMoney', () => {
  it('正数带 ¥ 两位小数', () => {
    expect(formatMoney(1234)).toBe('¥12.34');
  });

  it('负数带 -¥ 前缀', () => {
    expect(formatMoney(-1234)).toBe('-¥12.34');
  });

  it('零为 ¥0.00', () => {
    expect(formatMoney(0)).toBe('¥0.00');
  });

  it('不足一元补零', () => {
    expect(formatMoney(5)).toBe('¥0.05');
  });

  it('整数部分加千分位', () => {
    expect(formatMoney(123456789)).toBe('¥1,234,567.89');
    expect(formatMoney(-123456789)).toBe('-¥1,234,567.89');
    expect(formatMoney(100000)).toBe('¥1,000.00');
  });
});

describe('dayLabel', () => {
  it('今天与昨天用相对说法', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    expect(dayLabel(`${y}-${m}-${d}`)).toMatch(/^今天 · 周/);

    const yes = new Date(y, today.getMonth(), today.getDate() - 1);
    const ym = (yes.getMonth() + 1).toString().padStart(2, '0');
    const yd = yes.getDate().toString().padStart(2, '0');
    expect(dayLabel(`${yes.getFullYear()}-${ym}-${yd}`)).toMatch(/^昨天 · 周/);
  });

  it('其它日期显示月日与星期', () => {
    expect(dayLabel('2026-09-01')).toBe('9月1日 周二');
  });
});

describe('centsToInput', () => {
  it('回填表单用无符号小数', () => {
    expect(centsToInput(1234)).toBe('12.34');
    expect(centsToInput(0)).toBe('0');
    expect(centsToInput(-500)).toBe('-5');
  });
});

describe('todayISO / currentMonth', () => {
  it('currentMonth 返回 YYYY-MM', () => {
    const m = currentMonth();
    expect(m).toMatch(/^\d{4}-\d{2}$/);
  });

  it('todayISO 返回 YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('monthLabel', () => {
  it('转换为中文年月', () => {
    expect(monthLabel('2026-09')).toBe('2026年9月');
  });
});

describe('shiftMonth', () => {
  it('正常前移', () => {
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });

  it('跨年回退', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('跨年前进', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });
});
