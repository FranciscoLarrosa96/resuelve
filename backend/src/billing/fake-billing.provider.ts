import { randomUUID } from 'crypto';
import {
  BillingProvider,
  BillingProviderError,
  CreateSubscriptionInput,
  ProviderAuthorizedPayment,
  ProviderSubscription,
} from './billing-provider';

interface FakeSub extends ProviderSubscription {
  payerEmail: string;
  backUrl: string;
}

/**
 * Doble en memoria de Mercado Pago. Lo usan los tests e2e (siempre) y, con
 * `BILLING_PROVIDER=fake` fuera de producción, el recorrido local/Playwright
 * con un checkout falso servido por el backend. Nunca cobra nada.
 *
 * Los tests manejan el "lado Mercado Pago" con `authorize`, `pause`,
 * `charge`… y después mandan el webhook firmado.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly name = 'MERCADO_PAGO' as const;
  configured = true;
  /** Base de la URL de checkout falsa (el backend la sirve en dev). */
  checkoutBase = 'https://fake-mp.test/checkout';

  readonly subscriptions = new Map<string, FakeSub>();
  readonly payments = new Map<string, ProviderAuthorizedPayment>();
  readonly calls: string[] = [];

  /** Próxima creación: 'ambiguous' crea igual y tira timeout; 'error' falla sin crear. */
  failNextCreate: 'ambiguous' | 'error' | null = null;
  /** Próximas N actualizaciones de monto fallan (timeout). */
  failAmountUpdates = 0;
  failNextCancel = false;
  private clock = 0;

  /** `last_modified` estrictamente creciente (orden real de cambios). */
  private tick(): Date {
    this.clock = Math.max(this.clock + 1000, Date.now());
    return new Date(this.clock);
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    this.calls.push(`create:${input.amount}`);
    const mode = this.failNextCreate;
    this.failNextCreate = null;
    if (mode === 'error') throw new BillingProviderError('Mercado Pago respondió 400', false, 400);
    const id = `fake-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const sub: FakeSub = {
      id,
      status: 'pending',
      externalReference: input.externalReference,
      checkoutUrl: `${this.checkoutBase}/${id}`,
      amount: input.amount,
      currency: input.currency,
      nextPaymentDate: null,
      lastModified: this.tick(),
      payerEmail: input.payerEmail,
      backUrl: input.backUrl,
    };
    this.subscriptions.set(id, sub);
    if (mode === 'ambiguous') throw new BillingProviderError('Mercado Pago no respondió (timeout)', true);
    return this.view(sub);
  }

  async getSubscription(id: string) {
    this.calls.push(`get:${id}`);
    const sub = this.subscriptions.get(id);
    return sub ? this.view(sub) : null;
  }

  async findSubscriptionByExternalReference(ref: string) {
    this.calls.push(`search:${ref}`);
    const sub = [...this.subscriptions.values()].find((s) => s.externalReference === ref);
    return sub ? this.view(sub) : null;
  }

  async updateSubscriptionAmount(id: string, amount: number, currency: string) {
    this.calls.push(`update-amount:${amount}`);
    if (this.failAmountUpdates > 0) {
      this.failAmountUpdates--;
      throw new BillingProviderError('Mercado Pago no respondió (timeout)', true);
    }
    const sub = this.must(id);
    Object.assign(sub, { amount, currency, lastModified: this.tick() });
    return this.view(sub);
  }

  async cancelSubscription(id: string) {
    this.calls.push(`cancel:${id}`);
    if (this.failNextCancel) {
      this.failNextCancel = false;
      throw new BillingProviderError('Mercado Pago respondió 500', true, 500);
    }
    const sub = this.must(id);
    Object.assign(sub, { status: 'cancelled', lastModified: this.tick() });
    return this.view(sub);
  }

  async getAuthorizedPayment(id: string) {
    this.calls.push(`get-payment:${id}`);
    const p = this.payments.get(id);
    return p ? { ...p } : null;
  }

  async listAuthorizedPayments(subscriptionId: string) {
    return [...this.payments.values()].filter((p) => p.subscriptionId === subscriptionId).map((p) => ({ ...p }));
  }

  // ---- "Lado Mercado Pago" (lo que haría el usuario o MP) -----------------

  /** El usuario autorizó en el checkout: primer cobro en 1 mes. */
  authorize(id: string, nextPaymentDate = new Date(Date.now() + 30 * 86_400_000)): ProviderSubscription {
    const sub = this.must(id);
    Object.assign(sub, { status: 'authorized', nextPaymentDate, lastModified: this.tick() });
    return this.view(sub);
  }

  setStatus(id: string, status: string): ProviderSubscription {
    const sub = this.must(id);
    Object.assign(sub, { status, lastModified: this.tick() });
    return this.view(sub);
  }

  /**
   * Un cobro del ciclo. `paymentStatus` approved/rejected; el monto sale de
   * la suscripción (lo que MP cobraría) salvo que se indique.
   */
  charge(
    subscriptionId: string,
    paymentStatus: 'approved' | 'rejected' | null,
    opts: { id?: string; amount?: number; status?: string; retryAttempt?: number } = {},
  ): ProviderAuthorizedPayment {
    const sub = this.must(subscriptionId);
    const id = opts.id ?? String(7_000_000_000 + this.payments.size + 1);
    const payment: ProviderAuthorizedPayment = {
      id,
      subscriptionId,
      status: opts.status ?? (paymentStatus === 'approved' ? 'processed' : paymentStatus ? 'recycling' : 'scheduled'),
      amount: opts.amount ?? sub.amount ?? 0,
      currency: sub.currency ?? 'ARS',
      paymentId: paymentStatus ? String(90_000_000 + this.payments.size + 1) : null,
      paymentStatus,
      paymentStatusDetail: paymentStatus === 'rejected' ? 'cc_rejected_insufficient_amount' : paymentStatus ? 'accredited' : null,
      retryAttempt: opts.retryAttempt ?? (paymentStatus === 'rejected' ? 1 : 0),
      debitDate: new Date(),
      lastModified: this.tick(),
    };
    this.payments.set(id, payment);
    if (paymentStatus === 'approved') {
      Object.assign(sub, { nextPaymentDate: new Date(Date.now() + 30 * 86_400_000), lastModified: this.tick() });
    }
    return { ...payment };
  }

  byExternalReference(ref: string): ProviderSubscription | undefined {
    const sub = [...this.subscriptions.values()].find((s) => s.externalReference === ref);
    return sub ? this.view(sub) : undefined;
  }

  backUrlOf(id: string): string | undefined {
    return this.subscriptions.get(id)?.backUrl;
  }

  reset(): void {
    this.subscriptions.clear();
    this.payments.clear();
    this.calls.length = 0;
    this.failNextCreate = null;
    this.failAmountUpdates = 0;
    this.failNextCancel = false;
  }

  private must(id: string): FakeSub {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new BillingProviderError('Mercado Pago respondió 404', false, 404);
    return sub;
  }

  private view(sub: FakeSub): ProviderSubscription {
    return {
      id: sub.id,
      status: sub.status,
      externalReference: sub.externalReference,
      checkoutUrl: sub.checkoutUrl,
      amount: sub.amount,
      currency: sub.currency,
      nextPaymentDate: sub.nextPaymentDate,
      lastModified: sub.lastModified,
    };
  }
}
