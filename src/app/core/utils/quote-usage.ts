import { QuoteUsage } from '../models/pro-analytics';
import { formatThousands } from './format';

/**
 * Cupo FREE de presupuestos: qué se muestra y cuándo. Recibir solicitudes nunca
 * tiene tope; esto solo habla de RESPONDER. PRO se menciona recién cuando
 * quedan 3 (7 de 10): antes, solo el contador. Nada se bloquea antes del límite.
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

/** Texto del límite (lista, presupuesto y diálogo del intento siguiente): una sola versión. */
export const FREE_LIMIT_COPY = {
  title: 'Llegaste al límite de Free',
  body: 'Vas a seguir recibiendo solicitudes, pero no vas a poder enviar nuevos presupuestos hasta el próximo mes.',
  pro: 'Con Resuelve PRO podés presupuestar sin límite.',
  cta: 'Pasarme a PRO',
  stay: 'Seguir con Free',
} as const;

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
      remaining: 'Te queda 1 presupuesto este mes.',
      detail: 'Con PRO podés responder todas las oportunidades que te interesen.',
      cta: 'Ver Resuelve PRO',
    };
  }
  const remaining = `Te quedan ${u.remaining} este mes.`;
  return u.remaining <= QUOTE_USAGE_WARN_AT
    ? { ...base, tone: 'warn', counter, remaining, cta: 'Presupuestá sin límite con PRO' }
    : { ...base, tone: 'quiet', counter, remaining };
}

/** "$19.000 / mes" */
export const proPriceText = (ars: number): string => `$${formatThousands(ars)} / mes`;
/** "$19.000" (para leer el precio completo: "$19.000 por mes"). */
export const proPriceAmount = (ars: number): string => `$${formatThousands(ars)}`;
