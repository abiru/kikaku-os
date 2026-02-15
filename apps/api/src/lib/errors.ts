/**
 * Application error class for service-layer errors.
 *
 * Error handling guideline:
 * - Route handlers: Use jsonError() for HTTP responses
 * - Service layer: throw AppError (or Error) for internal errors
 * - Global error handler catches unhandled throws and returns JSON
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options?: { statusCode?: number; code?: string }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options?.statusCode ?? 500;
    this.code = options?.code ?? 'INTERNAL_ERROR';
  }

  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, { statusCode: 400, code: code ?? 'BAD_REQUEST' });
  }

  static notFound(message: string, code?: string): AppError {
    return new AppError(message, { statusCode: 404, code: code ?? 'NOT_FOUND' });
  }

  static unauthorized(message: string, code?: string): AppError {
    return new AppError(message, { statusCode: 401, code: code ?? 'UNAUTHORIZED' });
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, { statusCode: 409, code: code ?? 'CONFLICT' });
  }
}
