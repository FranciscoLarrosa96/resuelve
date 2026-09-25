import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../errors/error-codes';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

const DEFAULT_CODES: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/**
 * Formato único de error para toda la API:
 * { statusCode, code, message, details?, path, timestamp }
 * Nunca expone stack traces ni detalles de SQL al cliente.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const body = this.toBody(exception, req.originalUrl ?? req.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        {
          err:
            exception instanceof Error
              ? { name: exception.name, message: exception.message, stack: exception.stack }
              : exception,
          path: body.path,
        },
        'Unhandled error',
      );
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: 429,
        code: ErrorCode.RATE_LIMITED,
        message: 'Demasiadas solicitudes. Probá de nuevo en un momento.',
        path,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const payload =
        typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);
      // ValidationPipe devuelve `message: string[]`.
      const rawMessage = payload['message'];
      const isValidationList = Array.isArray(rawMessage);
      return {
        statusCode,
        code: (payload['code'] as string) ?? DEFAULT_CODES[statusCode] ?? ErrorCode.INTERNAL_ERROR,
        message: isValidationList ? 'Datos inválidos' : String(rawMessage ?? exception.message),
        details: isValidationList ? rawMessage : payload['details'],
        path,
        timestamp,
      };
    }

    // Violación de unicidad no prevista por la lógica de negocio.
    if (
      exception instanceof QueryFailedError &&
      (exception as QueryFailedError & { code?: string }).code === '23505'
    ) {
      return {
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.CONFLICT,
        message: 'El recurso ya existe',
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Error interno',
      path,
      timestamp,
    };
  }
}
