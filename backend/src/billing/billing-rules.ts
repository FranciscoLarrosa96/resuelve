import type { ConfigService } from '@nestjs/config';
import { BillingPaymentStatus, BillingSubscriptionStatus } from './billing.enums';
import type { BillingSubscription } from './billing-subscription.entity';
import type { ProviderAuthorizedPayment } from './billing-provider';

/**
 * Reglas de billing: única fuente de cómo se traduce el proveedor a estados
 * internos y de hasta cuándo una suscripción da PRO. Funciones puras (sin
 * base ni HTTP): las usan la reconciliación, el status y los tests.
 */

const DAY_MS = 86_400_000;
/** Si el proveedor no informa el próximo cobro: un mes y un día desde el último dato. */
const FALLBACK_CYCLE_DAYS = 31;

export const billingGraceDays = (config: ConfigService): number => config.get<number>('BILLING_GRACE_DAYS', 10);

/**
 * Estado del preapproval → estado interno. `authorized` NO borra un PAST_DUE:
 * la suscripción sigue autorizada aunque el cobro del ciclo esté en
 * reintento (eso lo deciden los cobros, no el preapproval).
 */
export function subscriptionStatusFromProvider(
  providerStatus: string,
  current: BillingSubscriptionStatus,
): BillingSubscriptionStatus {
  switch (providerStatus.toLowerCase()) {
    case 'pending':
      return BillingSubscriptionStatus.PENDING;
    case 'authorized':
      return current === BillingSubscriptionStatus.PAST_DUE
        ? BillingSubscriptionStatus.PAST_DUE
        : BillingSubscriptionStatus.ACTIVE;
    case 'paused':
      return BillingSubscriptionStatus.PAUSED;
    case 'cancelled':
    case 'canceled':
      return BillingSubscriptionStatus.CANCELLED;
    default:
      return current;
  }
}

/** Invoice / authorized payment → estado interno del cobro. */
export function paymentStatusFromProvider(p: Pick<ProviderAuthorizedPayment, 'status' | 'paymentStatus'>) {
  const payment = p.paymentStatus?.toLowerCase();
  const invoice = p.status.toLowerCase();
  if (payment === 'refunded') return BillingPaymentStatus.REFUNDED;
  if (payment === 'approved') return BillingPaymentStatus.APPROVED;
  if (invoice === 'cancelled' || invoice === 'canceled') return BillingPaymentStatus.CANCELLED;
  if (payment === 'rejected' || payment === 'cancelled' || invoice === 'recycling') return BillingPaymentStatus.REJECTED;
  return BillingPaymentStatus.PENDING;
}

type AccessFields = Pick<
  BillingSubscription,
  'status' | 'nextPaymentAt' | 'authorizedAt' | 'pastDueSince' | 'accessUntil'
>;

/**
 * Hasta cuándo esta suscripción da PRO (null = no da):
 * - ACTIVE: hasta el próximo cobro + gracia (si los avisos se cortan, no
 *   queda PRO para siempre; la reconciliación lo corre en cada cobro).
 * - PAST_DUE: `past_due_since` + gracia; pasado eso, Free aunque MP siga
 *   reintentando. Un cobro aprobado después lo devuelve a ACTIVE.
 * - CANCELLED: `access_until` (fin del período pago), por fecha: vence sola,
 *   sin esperar otro aviso.
 * - PENDING / PAUSED: nunca.
 */
export function subscriptionAccessUntil(s: AccessFields, graceDays: number, now = new Date()): Date | null {
  const grace = graceDays * DAY_MS;
  switch (s.status) {
    case BillingSubscriptionStatus.ACTIVE: {
      const renewal =
        s.nextPaymentAt ?? new Date((s.authorizedAt ?? now).getTime() + FALLBACK_CYCLE_DAYS * DAY_MS);
      return new Date(renewal.getTime() + grace);
    }
    case BillingSubscriptionStatus.PAST_DUE:
      return new Date((s.pastDueSince ?? now).getTime() + grace);
    case BillingSubscriptionStatus.CANCELLED:
      return s.accessUntil;
    default:
      return null;
  }
}

/** PRO por billing del profesional: la mayor vigencia entre sus suscripciones. */
export function billingProUntil(subs: AccessFields[], graceDays: number, now = new Date()): Date | null {
  let best: Date | null = null;
  for (const s of subs) {
    const until = subscriptionAccessUntil(s, graceDays, now);
    if (until && (!best || until > best)) best = until;
  }
  return best;
}

/**
 * Fin del período YA PAGADO al cancelar (PRO hasta ahí, sin renovación).
 *
 * - El ciclo arranca en el último cobro aprobado o, si ese cobro todavía no
 *   llegó a Resuelve, en la autorización: un preapproval SIN prueba gratis
 *   cobra el primer mes al autorizarse (sin eso Mercado Pago no lo autoriza).
 *   El aviso del cobro puede llegar tarde o después de cancelar; no por eso
 *   se pierde lo pagado.
 * - Termina en el próximo cobro informado por el proveedor, acotado a un
 *   ciclo desde el inicio (un `next_payment_date` raro nunca regala meses).
 * - PENDING (nunca autorizada) / PAUSED: no hay período pago.
 * - PAST_DUE: el cobro que falló es el del ciclo nuevo; lo pago termina en
 *   el ciclo del último cobro aprobado (sin la gracia: no se extiende nada).
 * null = no hay período pago que conservar.
 */
export function paidThrough(
  s: Pick<BillingSubscription, 'status' | 'lastPaymentAt' | 'nextPaymentAt' | 'authorizedAt'>,
  providerNextPayment: Date | null,
): Date | null {
  if (s.status === BillingSubscriptionStatus.PENDING || s.status === BillingSubscriptionStatus.PAUSED) return null;
  if (s.status === BillingSubscriptionStatus.PAST_DUE) {
    return s.lastPaymentAt ? new Date(s.lastPaymentAt.getTime() + FALLBACK_CYCLE_DAYS * DAY_MS) : null;
  }
  const start = s.lastPaymentAt ?? s.authorizedAt;
  if (!start) return null;
  const cap = new Date(start.getTime() + (FALLBACK_CYCLE_DAYS + 1) * DAY_MS);
  const next = providerNextPayment ?? s.nextPaymentAt;
  const end = next && next > start ? next : new Date(start.getTime() + FALLBACK_CYCLE_DAYS * DAY_MS);
  return end < cap ? end : cap;
}

export const billingWithdrawalDays = (config: ConfigService): number => config.get<number>('BILLING_WITHDRAWAL_DAYS', 10);

/**
 * Hasta cuándo puede arrepentirse de la contratación: `withdrawalDays` días
 * corridos desde que autorizó el cobro (null = nunca se contrató o ya revocó).
 * Es el derecho de revocación del consumidor (Ley 24.240, art. 34): no depende
 * de si usó PRO, ni del motivo.
 */
export function withdrawalDeadline(
  s: Pick<BillingSubscription, 'authorizedAt' | 'withdrawnAt'>,
  withdrawalDays: number,
): Date | null {
  if (!s.authorizedAt || s.withdrawnAt) return null;
  return new Date(s.authorizedAt.getTime() + withdrawalDays * DAY_MS);
}

export function canWithdraw(
  s: Pick<BillingSubscription, 'authorizedAt' | 'withdrawnAt'>,
  withdrawalDays: number,
  now = new Date(),
): boolean {
  const deadline = withdrawalDeadline(s, withdrawalDays);
  return !!deadline && now <= deadline;
}

/** Ruta interna a la que volver tras activar (nunca una URL externa). */
export function safeReturnPath(path: string | undefined | null): string | null {
  if (!path) return null;
  return /^\/pro(\/[A-Za-z0-9_-]+){0,4}$/.test(path) && path.length <= 200 ? path : null;
}
