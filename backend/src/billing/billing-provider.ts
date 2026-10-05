/**
 * Contrato con el proveedor de cobro. `MercadoPagoBillingProvider` habla con
 * la API real; `FakeBillingProvider` (tests, dev y Playwright) la imita en
 * memoria. El resto de billing nunca ve la forma cruda de la API.
 */
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');

export interface CreateSubscriptionInput {
  /** `billing_subscriptions.id`: vuelve como `external_reference`. */
  externalReference: string;
  payerEmail: string;
  reason: string;
  amount: number;
  currency: string;
  backUrl: string;
}

/** Suscripción tal como la informa el proveedor (estado CRUDO: lo traduce `billing-rules.ts`). */
export interface ProviderSubscription {
  id: string;
  status: string;
  externalReference: string | null;
  checkoutUrl: string | null;
  amount: number | null;
  currency: string | null;
  nextPaymentDate: Date | null;
  lastModified: Date | null;
}

/** Cobro recurrente (authorized payment / invoice). */
export interface ProviderAuthorizedPayment {
  id: string;
  subscriptionId: string;
  /** Estado de la invoice: scheduled | processed | recycling | cancelled… */
  status: string;
  amount: number;
  currency: string;
  paymentId: string | null;
  /** approved | rejected | pending… (null si todavía no se intentó cobrar). */
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  retryAttempt: number | null;
  debitDate: Date | null;
  lastModified: Date | null;
}

/** Reembolso de un pago (siempre total: el arrepentimiento devuelve todo lo cobrado). */
export interface ProviderRefund {
  id: string;
  paymentId: string;
  amount: number | null;
  status: string;
}

export interface BillingProvider {
  readonly name: 'MERCADO_PAGO';
  /** false = billing apagado (`BILLING_PROVIDER=none` o sin credenciales). */
  readonly configured: boolean;
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  getSubscription(id: string): Promise<ProviderSubscription | null>;
  /** Para un timeout ambiguo al crear: ¿el proveedor la creó igual? */
  findSubscriptionByExternalReference(externalReference: string): Promise<ProviderSubscription | null>;
  updateSubscriptionAmount(id: string, amount: number, currency: string): Promise<ProviderSubscription>;
  cancelSubscription(id: string): Promise<ProviderSubscription>;
  getAuthorizedPayment(id: string): Promise<ProviderAuthorizedPayment | null>;
  /** Devuelve el pago completo al medio de pago original. */
  refundPayment(paymentId: string): Promise<ProviderRefund>;
  /** Cobros de una suscripción (reconciliación sin depender del webhook). */
  listAuthorizedPayments(subscriptionId: string): Promise<ProviderAuthorizedPayment[]>;
}

/**
 * Error del proveedor. `ambiguous` = no sabemos si la operación se aplicó
 * (timeout, red cortada, 5xx): una creación así se reconcilia por
 * `external_reference`, nunca se reintenta a ciegas.
 */
export class BillingProviderError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}

/** Billing apagado (`BILLING_PROVIDER=none`): el checkout responde 503 y /plans dice `selfServe: false`. */
export class DisabledBillingProvider implements BillingProvider {
  readonly name = 'MERCADO_PAGO' as const;
  readonly configured = false;
  private off(): never {
    throw new BillingProviderError('Billing no configurado', false);
  }
  createSubscription(): Promise<ProviderSubscription> {
    return this.off();
  }
  async getSubscription() {
    return null;
  }
  async findSubscriptionByExternalReference() {
    return null;
  }
  updateSubscriptionAmount(): Promise<ProviderSubscription> {
    return this.off();
  }
  cancelSubscription(): Promise<ProviderSubscription> {
    return this.off();
  }
  refundPayment(): Promise<ProviderRefund> {
    return this.off();
  }
  async getAuthorizedPayment() {
    return null;
  }
  async listAuthorizedPayments() {
    return [];
  }
}
