import { request } from '../lib/http';
import { assertPastOrCurrentMonth, centsToYuan, parseYuanToCents, requireCurrentLedger } from './business-state';

export interface Asset { id: number; name: string; valueCents?: number; value?: string; kind?: string; archived?: boolean | number; updatedAt?: string; }
export interface AssetSnapshot { id: number; asset_id: number; month: string; value_cents?: number; valueCents?: number; value?: string; note?: string | null; }

function money(value: string | number): number {
  const cents = parseYuanToCents(value);
  if (cents === null || cents < 0) throw new Error('金额必须是非负的有效金额');
  return centsToYuan(cents);
}

export async function listAssets(): Promise<Asset[]> { requireCurrentLedger(); return request<Asset[]>('/api/assets'); }
export async function createAsset(input: { name: string; value: string | number; kind?: string }): Promise<Asset> {
  requireCurrentLedger();
  return request<Asset>('/api/assets', { method: 'POST', data: { name: input.name.trim(), value: money(input.value), ...(input.kind?.trim() ? { kind: input.kind.trim() } : {}) } });
}
export async function updateAsset(id: number, input: { name?: string; value?: string | number; kind?: string }): Promise<Asset> {
  requireCurrentLedger();
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.value !== undefined) data.value = money(input.value);
  if (input.kind !== undefined) data.kind = input.kind.trim();
  return request<Asset>(`/api/assets/${id}`, { method: 'PATCH', data });
}
export async function listSnapshots(assetId: number): Promise<AssetSnapshot[]> { requireCurrentLedger(); return request<AssetSnapshot[]>(`/api/assets/${assetId}/snapshots`); }
export async function createSnapshot(assetId: number, input: { month: string; value: string | number; note?: string | null }): Promise<AssetSnapshot> {
  requireCurrentLedger();
  assertPastOrCurrentMonth(input.month);
  return request<AssetSnapshot>(`/api/assets/${assetId}/snapshots`, { method: 'POST', data: { month: input.month, value: money(input.value), note: input.note ?? null } });
}
export { archiveSharedResource, restoreSharedResource } from './business-state';
