/** Proveedor de cobro. Hoy uno solo; el resto del código no depende de él. */
export enum BillingProviderName {
  MERCADO_PAGO = 'MERCADO_PAGO',
}

/**
 * Estado INTERNO de una suscripción (nunca strings crudos del proveedor fuera
 * de `billing-rules.ts`):
 * - PENDING: checkout creado, todavía sin autorizar en el proveedor.
 * - ACTIVE: autorizada y al día.
 * - PAST_DUE: autorizada, pero el cobro del ciclo fue rechazado / está en
 *   reintento. PRO sigue durante `BILLING_GRACE_DAYS`.
 * - PAUSED: pausada en el proveedor → sin PRO.
 * - CANCELLED: terminal. PRO solo hasta `access_until` (fin del período pago).
 */
export enum BillingSubscriptionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

/** Estados que ocupan el único lugar de suscripción viva por profesional. */
export const OPEN_SUBSCRIPTION_STATUSES = [
  BillingSubscriptionStatus.PENDING,
  BillingSubscriptionStatus.ACTIVE,
  BillingSubscriptionStatus.PAST_DUE,
  BillingSubscriptionStatus.PAUSED,
] as const;

/** Estado interno de un cobro recurrente (invoice / authorized payment). */
export enum BillingPaymentStatus {
  /** Programado o procesándose: todavía sin resultado. */
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  /** Rechazado; el proveedor puede reintentarlo (`retry_attempt`). */
  REJECTED = 'REJECTED',
  /** El proveedor dejó de intentarlo o lo anuló. */
  CANCELLED = 'CANCELLED',
  /** Reembolsado (arrepentimiento): ya no cuenta como cobro vigente. */
  REFUNDED = 'REFUNDED',
}
