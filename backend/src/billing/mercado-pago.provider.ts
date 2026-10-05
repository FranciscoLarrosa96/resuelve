import { Logger } from '@nestjs/common';
import {
  BillingProvider,
  BillingProviderError,
  CreateSubscriptionInput,
  ProviderAuthorizedPayment,
  ProviderRefund,
  ProviderSubscription,
} from './billing-provider';
import { oneLine, summarizeMercadoPagoError, summarizePreapprovalPayload } from './mercado-pago-log';

const API_BASE = 'https://api.mercadopago.com';

export interface MercadoPagoOptions {
  accessToken: string;
  timeoutMs: number;
  /** Solo pruebas locales contra un doble de la API. En producción, vacía. */
  apiBase?: string;
}

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v ? Number(v) : null);
const date = (v: unknown): Date | null => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function parsePreapproval(body: Json): ProviderSubscription {
  const recurring = (body.auto_recurring ?? {}) as Json;
  return {
    id: String(body.id),
    status: String(body.status ?? ''),
    externalReference: str(body.external_reference),
    checkoutUrl: str(body.init_point),
    amount: num(recurring.transaction_amount),
    currency: str(recurring.currency_id),
    nextPaymentDate: date(body.next_payment_date),
    lastModified: date(body.last_modified),
  };
}

export function parseAuthorizedPayment(body: Json): ProviderAuthorizedPayment {
  const payment = (body.payment ?? {}) as Json;
  return {
    id: String(body.id),
    subscriptionId: String(body.preapproval_id ?? ''),
    status: String(body.status ?? ''),
    amount: num(body.transaction_amount) ?? 0,
    currency: str(body.currency_id) ?? 'ARS',
    paymentId: str(payment.id),
    paymentStatus: str(payment.status),
    paymentStatusDetail: str(payment.status_detail),
    retryAttempt: num(body.retry_attempt),
    debitDate: date(body.debit_date),
    lastModified: date(body.last_modified),
  };
}

/**
 * Cliente mínimo de Suscripciones de Mercado Pago (preapproval SIN plan).
 *
 * - Timeout explícito en cada llamada (`MP_TIMEOUT_MS`).
 * - Reintenta SOLO lecturas (GET) ante red/429/5xx. POST y PUT nunca se
 *   reintentan acá: una creación ambigua se reconcilia por `external_reference`.
 * - `X-Idempotency-Key` en la creación (el SDK oficial lo manda en todo
 *   POST/PUT); igual no dependemos de él.
 * - Nunca loguea el Access Token ni datos de tarjeta. Ante un error loguea
 *   status/message/error/cause y el body de la respuesta SANITIZADOS, y en la
 *   creación un resumen del payload con el email enmascarado
 *   (`mercado-pago-log.ts`).
 */
export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = 'MERCADO_PAGO' as const;
  readonly configured = true;
  private readonly logger = new Logger('MercadoPago');

  constructor(private readonly opts: MercadoPagoOptions) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const payload = {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.amount,
        currency_id: input.currency,
      },
      back_url: input.backUrl,
      status: 'pending',
    };
    const body = await this.request('POST', '/preapproval', {
      body: payload,
      idempotencyKey: input.externalReference,
      logPayload: summarizePreapprovalPayload(payload),
    });
    return parsePreapproval(body!);
  }

  async getSubscription(id: string): Promise<ProviderSubscription | null> {
    const body = await this.request('GET', `/preapproval/${encodeURIComponent(id)}`, { allowNotFound: true });
    return body ? parsePreapproval(body) : null;
  }

  async findSubscriptionByExternalReference(externalReference: string): Promise<ProviderSubscription | null> {
    const body = await this.request('GET', '/preapproval/search', {
      query: { external_reference: externalReference },
    });
    const results = ((body?.results as Json[] | undefined) ?? []).map(parsePreapproval);
    return results.find((r) => r.externalReference === externalReference) ?? null;
  }

  async updateSubscriptionAmount(id: string, amount: number, currency: string): Promise<ProviderSubscription> {
    const body = await this.request('PUT', `/preapproval/${encodeURIComponent(id)}`, {
      body: { auto_recurring: { transaction_amount: amount, currency_id: currency } },
    });
    return parsePreapproval(body!);
  }

  async cancelSubscription(id: string): Promise<ProviderSubscription> {
    const body = await this.request('PUT', `/preapproval/${encodeURIComponent(id)}`, {
      body: { status: 'cancelled' },
    });
    return parsePreapproval(body!);
  }

  async getAuthorizedPayment(id: string): Promise<ProviderAuthorizedPayment | null> {
    const body = await this.request('GET', `/authorized_payments/${encodeURIComponent(id)}`, {
      allowNotFound: true,
    });
    return body ? parseAuthorizedPayment(body) : null;
  }

  /**
   * Reembolso total (`POST /v1/payments/{id}/refunds` sin monto). La clave de
   * idempotencia es por pago: reintentar nunca devuelve dos veces.
   */
  async refundPayment(paymentId: string): Promise<ProviderRefund> {
    const body = await this.request('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
      body: {},
      idempotencyKey: `refund-${paymentId}`,
    });
    return {
      id: String(body!.id),
      paymentId: str(body!.payment_id) ?? paymentId,
      amount: num(body!.amount),
      status: String(body!.status ?? ''),
    };
  }

  async listAuthorizedPayments(subscriptionId: string): Promise<ProviderAuthorizedPayment[]> {
    const body = await this.request('GET', '/authorized_payments/search', {
      query: { preapproval_id: subscriptionId, limit: '50' },
    });
    return ((body?.results as Json[] | undefined) ?? []).map(parseAuthorizedPayment);
  }

  private async request(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    opts: {
      body?: Json;
      query?: Record<string, string>;
      idempotencyKey?: string;
      allowNotFound?: boolean;
      /** Resumen ya sanitizado del payload, solo para el log de error. */
      logPayload?: Json;
    } = {},
  ): Promise<Json | null> {
    const url = new URL(`${this.opts.apiBase || API_BASE}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.accessToken}`,
      'Content-Type': 'application/json',
    };
    if (opts.idempotencyKey) headers['X-Idempotency-Key'] = opts.idempotencyKey;
    const attempts = method === 'GET' ? 3 : 1;

    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
      } catch (error) {
        const reason = (error as Error).name === 'TimeoutError' ? 'timeout' : 'red';
        if (attempt < attempts) {
          await pause(attempt);
          continue;
        }
        this.logger.warn(
          `mp ${method} ${routeOf(path)} falló (${reason})` +
            (opts.logPayload ? ` payload=${oneLine(opts.logPayload)}` : ''),
        );
        throw new BillingProviderError(`Mercado Pago no respondió (${reason})`, true);
      }
      if (res.status === 404 && opts.allowNotFound) return null;
      if (res.ok) return (await res.json()) as Json;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < attempts) {
        await pause(attempt);
        continue;
      }
      // El body puede traer datos del pagador: se loguea sanitizado.
      const raw = await res.text().catch(() => '');
      const summary = summarizeMercadoPagoError(res.status, raw, [this.opts.accessToken]);
      this.logger.warn(
        `mp ${method} ${routeOf(path)} → ${res.status}` +
          ` error=${oneLine({ status: summary.status, message: summary.message, error: summary.error, cause: summary.cause })}` +
          ` body=${oneLine(summary.body)}` +
          (opts.logPayload ? ` payload=${oneLine(opts.logPayload)}` : ''),
      );
      throw new BillingProviderError(`Mercado Pago respondió ${res.status}`, res.status >= 500, res.status);
    }
  }
}

const pause = (attempt: number) => new Promise((r) => setTimeout(r, 300 * attempt));
/** `/preapproval/abc` → `/preapproval/:id` (sin ids en los logs). */
const routeOf = (path: string) =>
  path.replace(/^(\/[^/]+)\/(?!search$)[^/]+$/, '$1/:id').replace(/\/\d+/g, '/:id');
