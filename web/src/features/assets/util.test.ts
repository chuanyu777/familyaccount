import { describe, expect, it } from 'vitest';
import { assetEmoji, assetKindEmoji } from './util';

describe('资产图标匹配（类型优先 + 名称兜底）', () => {
  it('用户选了类型 → 按类型显示', () => {
    expect(assetEmoji('某个东西', '金融投资')).toBe('📈');
    expect(assetEmoji('自住房', '不动产')).toBe('🏠');
    expect(assetEmoji('代步工具', '车辆')).toBe('🚗');
  });

  it('类型没填 → 按名称兜底', () => {
    expect(assetEmoji('贵州茅台', '')).toBe('📈');
    expect(assetEmoji('自住房', '')).toBe('🏠');
    expect(assetEmoji('特斯拉 Model Y', '')).toBe('🚗');
    expect(assetEmoji('金条', '')).toBe('🪙');
  });

  it('类型与名称都无信息 → 兜底 💼', () => {
    expect(assetEmoji('某个东西', '')).toBe('💼');
    expect(assetEmoji('', '')).toBe('💼');
    expect(assetEmoji(null, null)).toBe('💼');
  });

  it('存量自由文本类型（如「投资」）仍可匹配', () => {
    expect(assetKindEmoji('投资')).toBe('📈');
    expect(assetEmoji('随便', '投资')).toBe('📈');
    expect(assetKindEmoji('房产')).toBe('🏠');
  });
});
