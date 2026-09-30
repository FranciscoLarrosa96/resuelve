import { Entitlements, PlanTier } from './pro-analytics';

/** Estado interno de la suscripción (nunca el string crudo de Mercado Pago). */
export type BillingSubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED';

/** De dónde sale el PRO vigente: `plan:set` (MANUAL) o Mercado Pago (BILLING). */
export type PlanSource = 'MANUAL' | 'BILLING' | 'BONUS';

export interface BillingSubscription {
  id: string;
  status: BillingSubscriptionStatus;
  provider: 'MERCADO_PAGO';
  currentAmount: number;
  baseAmount: number;
  currency: string;
  /** Próximo cobro (ACTIVE / PAST_DUE). */
  nextPaymentAt: string | null;
  /** CANCELLED: PRO hasta esta fecha (null = ya terminó). */
  accessUntil: string | null;
  /** PAST_DUE: PRO se mantiene hasta acá mientras Mercado Pago reintenta. */
  graceUntil: string | null;
  /** PENDING: retomar el checkout en Mercado Pago. */
  checkoutUrl: string | null;
  offerCode: string | null;
  offerRedeemed: boolean;
  /** Ruta interna a la que volver después de activar. */
  returnPath: string | null;
  createdAt: string;
}

/** Lo que cobraría un checkout ahora: lo decide el backend (nunca el frontend). */
export interface CheckoutPrice {
  amount: number;
  baseAmount: number;
  currency: string;
  offerCode: string | null;
  offerCycles: number | null;
  discountPercent: number | null;
}

/** GET /billing/pro/status. */
export interface BillingStatus {
  /** false = la contratación online está apagada en el backend. */
  enabled: boolean;
  plan: PlanTier;
  source: PlanSource | null;
  entitlements: Entitlements;
  subscription: BillingSubscription | null;
  canCheckout: boolean;
  checkoutPrice: CheckoutPrice | null;
  /** Ya tuvo una suscripción autorizada ("Volver a PRO"). */
  hadSubscription: boolean;
}

/** POST /billing/pro/checkout: la única URL a la que se navega es la del proveedor. */
export interface CheckoutSession {
  checkoutUrl: string;
  subscriptionId: string;
}
