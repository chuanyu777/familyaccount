/** 图表配色：低饱和冷色系，取自设计令牌。环形图与图例共用，保证颜色对得上。 */
const PALETTE = [
  'var(--brand)',
  'var(--income)',
  'var(--expense)',
  'var(--slate)',
  'var(--warn)',
  'var(--ink-3)',
];

export function sliceColor(index: number): string {
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i] ?? 'var(--ink-3)';
}
