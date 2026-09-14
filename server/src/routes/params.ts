import { badRequest } from '../lib/httpError';

/**
 * 解析路由 :id 参数。非整数或 ≤0 视为非法，抛 400（交由 errorHandler 统一响应）。
 * 调用方在 try 中调用，catch 后 next(err)。
 */
export function parseIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('VALIDATION_FAILED', 'id 必须为正整数');
  }
  return id;
}
