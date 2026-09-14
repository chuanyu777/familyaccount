import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/httpError';

/**
 * 统一错误中间件。必须作为最后一个 app.use 注册（4 参数签名）。
 * - AppError：按 status 返回 { error: { code, message } }
 * - ZodError：400 + code VALIDATION_FAILED，message 取首个 issue 可读文本
 * - 其他：500 + INTERNAL_ERROR，不泄漏堆栈
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const message = issue
      ? `${issue.path.join('.')} ${issue.message}`.trim()
      : '校验失败';
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message } });
    return;
  }

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
}
