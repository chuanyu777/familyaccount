import { request } from '../lib/http';
import { requireCurrentLedger } from './business-state';

export type CategoryKind = 'expense' | 'income';
export interface Category { id: number; kind: CategoryKind; name: string; archived?: boolean | number; }

export async function listCategories(kind: CategoryKind): Promise<Category[]> {
  requireCurrentLedger();
  return request<Category[]>(`/api/categories?kind=${kind}`);
}

export async function createCategory(kind: CategoryKind, name: string): Promise<Category> {
  requireCurrentLedger();
  return request<Category>('/api/categories', { method: 'POST', data: { kind, name: name.trim() } });
}

export async function updateCategory(id: number, name: string): Promise<Category> {
  requireCurrentLedger();
  return request<Category>(`/api/categories/${id}`, { method: 'PATCH', data: { name: name.trim() } });
}

export { archiveSharedResource, restoreSharedResource } from './business-state';
