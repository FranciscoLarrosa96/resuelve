import { BillingStatus, BillingSubscription } from '../models/billing';
import { proPriceAmount } from './quote-usage';

/** "27 de octubre" / "27 de octubre de 2026" (hora de Argentina). */
export function billingDate(iso: string, withYear = false): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}

/**
 * Texto del botón que inicia el checkout (lo decide el estado del backend): si ya tuvo PRO pago,
 * "Volver a PRO". La oferta de bienvenida se muestra junto al precio, no en el botón.
 */
export function checkoutCta(status: Pick<BillingStatus, 'hadSubscription'> | null): string {
  return status?.hadSubscription ? 'Volver a PRO' : 'Quiero Resuelve PRO';
}

/** "$15.000 / mes" o, en el ciclo promocional todavía sin cobrar, "$12.000 el primer mes · luego $15.000 / mes". */
export function subscriptionPrice(s: Pick<BillingSubscription, 'currentAmount' | 'baseAmount' | 'offerRedeemed'>): string {
  if (s.currentAmount < s.baseAmount && !s.offerRedeemed) {
    return `${proPriceAmount(s.currentAmount)} el primer mes · luego ${proPriceAmount(s.baseAmount)} / mes`;
  }
  return `${proPriceAmount(s.currentAmount)} / mes`;
}
