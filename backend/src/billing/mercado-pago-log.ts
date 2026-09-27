/**
 * Logs SANITIZADOS de Mercado Pago para diagnosticar errores (p. ej. el 400 de
 * `POST /preapproval`) sin exponer secretos ni datos del pagador.
 *
 * Nunca pasan por acá headers (Authorization), `MP_ACCESS_TOKEN`,
 * `MP_WEBHOOK_SECRET` ni datos de tarjeta: las claves sensibles se tapan, los
 * emails se enmascaran y las secuencias largas de dígitos (PAN) se ocultan.
 */

type Json = Record<string, unknown>;

const MAX_STRING = 300;
const MAX_BODY = 2000;
const MAX_DEPTH = 5;
const MAX_ITEMS = 10;

/** Claves que nunca se loguean (se reemplazan por `[redacted]`). */
const SENSITIVE_KEY =
  /(authorization|token|secret|password|passwd|api[_-]?key|card|cvv|cvc|security[_-]?code|expiration|identification|doc(ument)?[_-]?number|phone|address|first[_-]?name|last[_-]?name)/i;
/** Claves con email: se muestran enmascaradas. */
const EMAIL_KEY = /email/i;

const EMAIL_RE = /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
/** 12+ dígitos seguidos (con espacios/guiones): posible número de tarjeta. */
const LONG_DIGITS_RE = /\b(?:\d[ -]?){12,19}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/gi;
/** Formato de las credenciales de MP (`APP_USR-…`, `TEST-…`). */
const MP_CREDENTIAL_RE = /\b(APP_USR|TEST)-[A-Za-z0-9-]{10,}/g;

/** `juan.perez@gmail.com` → `ju***@gmail.com` (el dominio ayuda: `testuser.com`). */
export function maskEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value);
  const at = s.lastIndexOf('@');
  if (at <= 0) return '[redacted]';
  const local = s.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***@${s.slice(at + 1)}`;
}

export function scrubString(value: string, secrets: readonly string[] = []): string {
  let out = value;
  for (const secret of secrets) if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
  out = out
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(MP_CREDENTIAL_RE, '$1-[redacted]')
    .replace(EMAIL_RE, (m) => maskEmail(m) ?? '[redacted]')
    .replace(LONG_DIGITS_RE, '[digits]');
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

/** Copia profunda con claves sensibles tapadas, emails enmascarados y tamaño acotado. */
export function sanitizeValue(value: unknown, secrets: readonly string[] = [], depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value, secrets);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => sanitizeValue(v, secrets, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[+${value.length - MAX_ITEMS}]`);
    return items;
  }
  if (typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      if (SENSITIVE_KEY.test(k)) out[k] = '[redacted]';
      else if (EMAIL_KEY.test(k)) out[k] = maskEmail(v);
      else out[k] = sanitizeValue(v, secrets, depth + 1);
    }
    return out;
  }
  return '[unsupported]';
}

export interface MercadoPagoErrorSummary {
  status: number;
  message: string | null;
  error: string | null;
  cause: { code: string | null; description: string | null }[];
  /** Body completo sanitizado (o texto recortado si no era JSON). */
  body: unknown;
}

const s = (v: unknown, secrets: readonly string[]): string | null =>
  v === undefined || v === null || v === '' ? null : scrubString(String(v), secrets);

/**
 * Resumen del error de la API: `{ message, error, status, cause: [{ code, description }] }`.
 * `cause` a veces viene como objeto suelto en vez de array.
 */
export function summarizeMercadoPagoError(
  httpStatus: number,
  rawBody: string,
  secrets: readonly string[] = [],
): MercadoPagoErrorSummary {
  let parsed: unknown = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: httpStatus,
      message: null,
      error: null,
      cause: [],
      body: rawBody ? scrubString(rawBody.slice(0, MAX_BODY), secrets) : null,
    };
  }
  const b = parsed as Json;
  const rawCause = b.cause === undefined || b.cause === null ? [] : Array.isArray(b.cause) ? b.cause : [b.cause];
  const cause = rawCause.slice(0, MAX_ITEMS).map((c) => {
    const item = (c && typeof c === 'object' ? c : { description: c }) as Json;
    return { code: s(item.code, secrets), description: s(item.description ?? item.message, secrets) };
  });
  return {
    status: typeof b.status === 'number' ? b.status : Number(b.status) || httpStatus,
    message: s(b.message, secrets),
    error: s(b.error, secrets),
    cause,
    body: sanitizeValue(b, secrets),
  };
}

/** Payload de `POST /preapproval` con solo los campos útiles para diagnosticar. */
export function summarizePreapprovalPayload(body: Json): Json {
  const recurring = (body.auto_recurring ?? {}) as Json;
  return {
    reason: body.reason ?? null,
    external_reference: body.external_reference ?? null,
    payer_email: maskEmail(body.payer_email),
    auto_recurring: {
      frequency: recurring.frequency ?? null,
      frequency_type: recurring.frequency_type ?? null,
      transaction_amount: recurring.transaction_amount ?? null,
      currency_id: recurring.currency_id ?? null,
    },
    back_url: body.back_url ?? null,
    status: body.status ?? null,
  };
}

/** JSON en una línea, recortado (los logs de Render cortan líneas enormes). */
export function oneLine(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…` : text;
}
