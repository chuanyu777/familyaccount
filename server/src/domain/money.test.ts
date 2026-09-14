import { describe, it, expect } from 'vitest';
import { toCents, toYuanString } from './money';

describe('toCents', () => {
  it('四舍五入规避浮点误差：12.345 -> 1235', () => {
    expect(toCents('12.345')).toBe(1235);
  });

  it('0.1 -> 10（浮点 0.1*100 不丢精度）', () => {
    expect(toCents(0.1)).toBe(10);
  });

  it('0.1 + 0.2 这条路精确 -> 30', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('普通两位小数 12.34 -> 1234', () => {
    expect(toCents('12.34')).toBe(1234);
  });

  it('超过两位的舍入 12.3456 -> 1235', () => {
    expect(toCents('12.3456')).toBe(1235);
  });

  it('允许负数 -0.05 -> -5', () => {
    expect(toCents('-0.05')).toBe(-5);
  });

  it('整数 0 -> 0', () => {
    expect(toCents('0')).toBe(0);
  });

  it('空字符串抛错', () => {
    expect(() => toCents('')).toThrow();
  });

  it('非数字字符串抛错', () => {
    expect(() => toCents('abc')).toThrow();
  });

  it('NaN 抛错', () => {
    expect(() => toCents(NaN)).toThrow();
  });
});

describe('toYuanString', () => {
  it('-5 -> "-0.05"', () => {
    expect(toYuanString(-5)).toBe('-0.05');
  });

  it('1234 -> "12.34"', () => {
    expect(toYuanString(1234)).toBe('12.34');
  });

  it('0 -> "0.00"', () => {
    expect(toYuanString(0)).toBe('0.00');
  });

  it('5 -> "0.05"', () => {
    expect(toYuanString(5)).toBe('0.05');
  });

  it('100 -> "1.00"', () => {
    expect(toYuanString(100)).toBe('1.00');
  });

  it('-1234 -> "-12.34"', () => {
    expect(toYuanString(-1234)).toBe('-12.34');
  });
});
