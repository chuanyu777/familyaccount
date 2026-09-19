/** 图表配色：低饱和冷色系，取自设计令牌。环形图与图例共用，保证颜色对得上。 */
const PALETTE = [
  'var(--expense)',
  'var(--chart-accent)',
  'color-mix(in srgb, var(--expense) 65%, var(--surface))',
  'var(--muted)',
  'color-mix(in srgb, var(--chart-accent) 55%, var(--surface))',
  'var(--ink)',
];

export function sliceColor(index: number): string {
  const i = ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
  return PALETTE[i] ?? 'var(--ink-3)';
}
