const CATEGORY_COLORS = [
  'var(--primary)',
  'var(--income)',
  'var(--expense)',
  'var(--muted)',
  'var(--nav)',
];

export function sliceColor(index: number): string {
  const normalized = Math.max(0, Math.trunc(index));
  if (normalized === 1) return 'var(--chart-accent)';
  const paletteIndex = normalized === 0 ? 0 : (normalized - 1) % CATEGORY_COLORS.length;
  return CATEGORY_COLORS[paletteIndex] ?? 'var(--primary)';
}
