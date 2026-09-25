import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/** Error de negocio con código estable. Lo serializa `HttpExceptionFilter`. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(what: string): AppException {
    return new AppException(ErrorCode.NOT_FOUND, `${what} no encontrado`, HttpStatus.NOT_FOUND);
  }

  static forbidden(
    message = 'No tenés permiso para esta acción',
    code: ErrorCode = ErrorCode.FORBIDDEN,
  ): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, details);
  }

  static unprocessable(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}
