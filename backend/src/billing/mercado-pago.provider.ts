import { Logger } from '@nestjs/common';
import {
  BillingProvider,
  BillingProviderError,
  CreateSubscriptionInput,
  ProviderAuthorizedPayment,
  ProviderSubscription,
} from './billing-provider';

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
 * - Nunca loguea el Access Token, el body completo ni datos del pagador.
 */
export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = 'MERCADO_PAGO' as const;
  readonly configured = true;
  private readonly logger = new Logger('MercadoPago');

  constructor(private readonly opts: MercadoPagoOptions) {}

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const body = await this.request('POST', '/preapproval', {
      body: {
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
      },
      idempotencyKey: input.externalReference,
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

  async listAuthorizedPayments(subscriptionId: string): Promise<ProviderAuthorizedPayment[]> {
    const body = await this.request('GET', '/authorized_payments/search', {
      query: { preapproval_id: subscriptionId, limit: '50' },
    });
    return ((body?.results as Json[] | undefined) ?? []).map(parseAuthorizedPayment);
  }

  private async request(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    opts: { body?: Json; query?: Record<string, string>; idempotencyKey?: string; allowNotFound?: boolean } = {},
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
        this.logger.warn(`mp ${method} ${routeOf(path)} falló (${reason})`);
        throw new BillingProviderError(`Mercado Pago no respondió (${reason})`, true);
      }
      if (res.status === 404 && opts.allowNotFound) return null;
      if (res.ok) return (await res.json()) as Json;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < attempts) {
        await pause(attempt);
        continue;
      }
      // Solo código y tipo de error: el body puede traer datos del pagador.
      const detail = await res
        .json()
        .then((b: unknown) => str((b as Json)?.error) ?? str((b as Json)?.code) ?? '')
        .catch(() => '');
      this.logger.warn(`mp ${method} ${routeOf(path)} → ${res.status} ${detail}`.trim());
      throw new BillingProviderError(`Mercado Pago respondió ${res.status}`, res.status >= 500, res.status);
    }
  }
}

const pause = (attempt: number) => new Promise((r) => setTimeout(r, 300 * attempt));
/** `/preapproval/abc` → `/preapproval/:id` (sin ids en los logs). */
const routeOf = (path: string) => path.replace(/^(\/[^/]+)\/(?!search$)[^/]+$/, '$1/:id');
