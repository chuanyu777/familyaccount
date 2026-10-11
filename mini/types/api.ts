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
  header?: Record<string, string | string[]>;
}

/** wx.request 的 fail 回调结果：真机上最常见的失败信息在 errMsg 里（域名未配置、超时、SSL 等）。 */
export interface MiniRequestFailResult {
  errMsg?: string;
  [key: string]: unknown;
}

export interface MiniRequestOptions<T = unknown> {
  url: string;
  method?: RequestMethod;
  data?: T;
  header?: Record<string, string>;
  success?: (result: MiniRequestSuccessResult) => void;
  // 与真实 wx.request 一致：fail 拿到的是平台给的不透明对象，调用方自行收窄
  fail?: (error: unknown) => void;
}

export interface MiniUploadFileSuccessResult {
  statusCode: number;
  data: string;
}

export interface MiniUploadFileOptions {
  url: string;
  filePath: string;
  name: string;
  header?: Record<string, string>;
  success?: (result: MiniUploadFileSuccessResult) => void;
  fail?: (error: unknown) => void;
}

export interface MiniProgramApi {
  request<T = unknown>(options: MiniRequestOptions<T>): unknown;
  login(options: { success?: (result: { code: string }) => void; fail?: (error: unknown) => void }): unknown;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  redirectTo(options: { url: string }): unknown;
  navigateTo(options: { url: string }): unknown;
  reLaunch(options: { url: string }): unknown;
  showToast(options: { title: string; icon?: 'none' | 'success'; duration?: number }): unknown;
  uploadFile(options: MiniUploadFileOptions): unknown;
}

declare global {
  const wx: MiniProgramApi;
  function App(options: Record<string, unknown>): void;
  function Page(options: Record<string, unknown>): void;
  function Component(options: any): void;
}

export type { MiniSession };
