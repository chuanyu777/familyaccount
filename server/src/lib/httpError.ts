/** 应用层统一错误：路由层据此映射 HTTP 状态码。所有模块共用。 */
export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function badRequest(code: string, message: string): AppError {
  return new AppError(message, code, 400);
}

export function notFound(code: string, message: string): AppError {
  return new AppError(message, code, 404);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(message, code, 409);
}
