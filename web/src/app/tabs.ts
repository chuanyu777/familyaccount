import type { Component } from 'vue';
import { BookOpenText, Wallet, CreditCard, ChartNoAxesColumnIncreasing, Settings } from 'lucide-vue-next';

export const TAB_KEYS = ['accounting', 'assets', 'liabilities', 'analysis', 'settings'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const TAB_DEFINITIONS = [
  { key: 'accounting', label: '记账', icon: BookOpenText },
  { key: 'assets', label: '资产', icon: Wallet },
  { key: 'liabilities', label: '负债', icon: CreditCard },
  { key: 'analysis', label: '分析', icon: ChartNoAxesColumnIncreasing },
  { key: 'settings', label: '设置', icon: Settings },
] satisfies { key: TabKey; label: string; icon: Component }[];

export function tabFromHash(hash: string): TabKey | null {
  const key = hash.replace(/^#/, '');
  return TAB_KEYS.includes(key as TabKey) ? (key as TabKey) : null;
}
