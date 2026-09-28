import { QuoteUsage } from '../models/pro-analytics';
import { EligibleIntroOffer } from '../models/pro-profile';
import { formatThousands } from './format';

/**
 * Cupo FREE de presupuestos: qué se muestra y cuándo. Recibir solicitudes nunca
 * tiene tope; esto solo habla de RESPONDER. PRO se menciona recién cuando
 * quedan pocas: antes, solo el contador. Nada se bloquea antes del límite.
 * La oferta de bienvenida (si el backend dice que es elegible) aparece recién
 * con 1 restante, en el límite y en el intento siguiente: nunca antes.
 */
export const QUOTE_USAGE_WARN_AT = 3;

/** quiet: contador · warn: quedan pocos · last: queda 1 · limit: sin cupo este mes. */
export type QuoteUsageTone = 'quiet' | 'warn' | 'last' | 'limit';

export interface QuoteUsageNotice {
  tone: QuoteUsageTone;
  /** "7 de 10" (null = sin límite: no hay contador que mostrar). */
  counter: string | null;
  used: number;
  /** null = sin límite. */
  limit: number | null;
  /** "Te quedan 3 este mes." (null en el límite o sin límite). */
  remaining: string | null;
  /** Por qué PRO, en una línea (solo cuando queda 1). */
  detail: string | null;
  /** Texto del enlace a PRO (null = no se ofrece: todavía no hace falta). */
  cta: string | null;
}

/** Texto del límite (lista y presupuesto, después del último): una sola versión. */
export const FREE_LIMIT_COPY = {
  title: (limit: number) => `Usaste tus ${limit} oportunidades Free de este mes`,
  body: 'Vas a seguir recibiendo solicitudes.',
  pro: 'Con PRO podés seguir respondiendo nuevas oportunidades.',
  cta: 'Conocer PRO',
  stay: 'Seguir con Free',
} as const;

/** Intento de responder una solicitud nueva con el cupo agotado (diálogo). */
export const LIMIT_MODAL_COPY = {
  title: 'No dejes pasar esta oportunidad',
  used: (limit: number) => `Ya usaste tus ${limit} presupuestos de este mes.`,
  pro: 'Con PRO podés responder esta solicitud y todas las próximas sin límite.',
  extra: 'Además, tu perfil puede aparecer en espacios destacados y accedés a todas tus métricas.',
  still: 'Vas a seguir recibiendo solicitudes.',
  context: 'Esta solicitud sigue disponible',
  ctaOffer: 'Aprovechar oferta',
  cta: 'Quiero PRO',
  stay: 'Seguir con Free',
} as const;

/** "20% OFF en tu primer mes" / "20% OFF en tus primeros 3 meses" (montos del backend). */
export function offerTitle(o: Pick<EligibleIntroOffer, 'discountPercent' | 'appliesToCycles'>): string {
  const when = o.appliesToCycles === 1 ? 'tu primer mes' : `tus primeros ${o.appliesToCycles} meses`;
  return `${o.discountPercent}% OFF en ${when}`;
}

/** "$12.000 el primer mes · Luego $15.000 / mes": el precio normal siempre visible. */
export function offerPriceLine(o: EligibleIntroOffer): { first: string; then: string } {
  const when = o.appliesToCycles === 1 ? 'el primer mes' : `los primeros ${o.appliesToCycles} meses`;
  return { first: `${proPriceAmount(o.discountedPriceArs)} ${when}`, then: `Luego ${proPriceText(o.basePriceArs)}` };
}

/** Adónde lleva "Pasarme a PRO": la página Plan con el pedido abierto. */
export const WANT_PRO_LINK = { path: '/pro/plan', query: { quiero: '1' } } as const;

/** true = FREE con el cupo del mes agotado: responder una solicitud nueva requiere PRO. */
export const quoteLimitReached = (u: QuoteUsage | null | undefined): boolean =>
  !!u && u.limit !== null && u.remaining === 0;

export function quoteUsageNotice(u: QuoteUsage): QuoteUsageNotice {
  const base = { used: u.used, limit: u.limit, detail: null, cta: null };
  if (u.limit === null || u.remaining === null) return { ...base, tone: 'quiet', counter: null, remaining: null };
  const counter = `${u.used} de ${u.limit}`;
  if (u.remaining === 0) return { ...base, tone: 'limit', counter, remaining: null, cta: FREE_LIMIT_COPY.cta };
  if (u.remaining === 1) {
    return {
      ...base,
      tone: 'last',
      counter,
      remaining: 'Te queda 1 respuesta disponible este mes.',
      detail: 'Con Resuelve PRO podés responder todas las oportunidades que te interesen.',
      cta: 'Ver PRO',
    };
  }
  const remaining = `Te quedan ${u.remaining} respuestas disponibles este mes.`;
  return u.remaining <= QUOTE_USAGE_WARN_AT
    ? { ...base, tone: 'warn', counter, remaining, cta: 'Presupuestá sin límite con PRO' }
    : { ...base, tone: 'quiet', counter, remaining };
}

/** "$15.000 / mes" */
export const proPriceText = (ars: number): string => `$${formatThousands(ars)} / mes`;
/** "$15.000" (para leer el precio completo: "$15.000 por mes"). */
export const proPriceAmount = (ars: number): string => `$${formatThousands(ars)}`;
