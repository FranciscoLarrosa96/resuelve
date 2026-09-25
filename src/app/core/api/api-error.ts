import { HttpErrorResponse } from '@angular/common/http';
import { ApiError } from './api.types';

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'network'
  | 'server';

/** Error de la API ya clasificado. `code` es el código estable del backend. */
export interface ClassifiedError {
  kind: ApiErrorKind;
  status: number;
  code: string | null;
  /** Campos señalados por la validación del backend (p. ej. ['password']). */
  fields: string[];
}

/**
 * Clasifica un error HTTP a partir de status y `code` (formato
 * `{ statusCode, code, message, details? }` del backend). Nunca expone
 * `message` al usuario: los textos los decide cada pantalla.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (!(error instanceof HttpErrorResponse)) return { kind: 'server', status: 0, code: null, fields: [] };
  const body = (error.error ?? null) as Partial<ApiError> | null;
  const code = typeof body?.code === 'string' ? body.code : null;
  const status = error.status;
  const kind: ApiErrorKind =
    status === 0 ? 'network'
    : status === 400 || status === 422 ? 'validation'
    : status === 401 ? 'unauthorized'
    : status === 403 ? 'forbidden'
    : status === 404 ? 'not-found'
    : status === 409 ? 'conflict'
    : status === 429 ? 'rate-limited'
    : 'server';
  return { kind, status, code, fields: validationFields(body?.details) };
}

/** ValidationPipe devuelve `details: ["password must be longer than…", …]`. */
function validationFields(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  const fields = details
    .filter((d): d is string => typeof d === 'string')
    .map((d) => d.split(' ')[0])
    .filter((f) => /^[a-zA-Z]+$/.test(f));
  return [...new Set(fields)];
}
