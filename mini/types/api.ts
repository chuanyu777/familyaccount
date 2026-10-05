import type { MiniSession } from './domain';

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: RequestMethod;
  data?: unknown;
  header?: Record<string, string>;
}

export interface MiniRequestSuccessResult<T = unknown> {
  statusCode: number;
  data: T;
}

export interface MiniRequestOptions<T = unknown> {
  url: string;
  method?: RequestMethod;
  data?: T;
  header?: Record<string, string>;
  success?: (result: MiniRequestSuccessResult) => void;
  fail?: (error: unknown) => void;
}

export interface MiniProgramApi {
  request<T = unknown>(options: MiniRequestOptions<T>): unknown;
  login(options: { success?: (result: { code: string }) => void; fail?: (error: unknown) => void }): unknown;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  redirectTo(options: { url: string }): unknown;
}

declare global {
  const wx: MiniProgramApi;
  function App(options: Record<string, unknown>): void;
  function Page(options: Record<string, unknown>): void;
}

export type { MiniSession };
