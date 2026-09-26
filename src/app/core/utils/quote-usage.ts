import { QuoteUsage } from '../models/pro-analytics';
import { formatThousands } from './format';
import { monthName } from './month-analytics';

/**
 * Cupo FREE de presupuestos: qué se muestra y cuándo. Recibir solicitudes nunca
 * tiene tope; esto solo habla de RESPONDER. Sin banners desde el primer uso:
 * hasta que queden 3 no se dice nada más que el contador.
 */
export const QUOTE_USAGE_WARN_AT = 3;

export type QuoteUsageTone = 'quiet' | 'warn' | 'limit';

export interface QuoteUsageNotice {
  tone: QuoteUsageTone;
  /** "7 de 10" (null = sin límite: no hay contador que mostrar). */
  counter: string | null;
  /** Mensaje contextual (null = no molestar). */
  message: string | null;
}

/** true = FREE con el cupo del mes agotado: responder una solicitud nueva requiere PRO. */
export const quoteLimitReached = (u: QuoteUsage | null | undefined): boolean =>
  !!u && u.limit !== null && u.remaining === 0;

export function quoteUsageNotice(u: QuoteUsage): QuoteUsageNotice {
  if (u.limit === null || u.remaining === null) return { tone: 'quiet', counter: null, message: null };
  const counter = `${u.used} de ${u.limit}`;
  if (u.remaining === 0) {
    return {
      tone: 'limit',
      counter,
      message: `Usaste tus ${u.limit} presupuestos de ${monthName(u.period)}.`,
    };
  }
  if (u.remaining <= QUOTE_USAGE_WARN_AT) {
    return {
      tone: 'warn',
      counter,
      message: u.remaining === 1 ? 'Te queda 1 presupuesto este mes.' : `Te quedan ${u.remaining} presupuestos este mes.`,
    };
  }
  return { tone: 'quiet', counter, message: null };
}

/** "$19.000 / mes" */
export const proPriceText = (ars: number): string => `$${formatThousands(ars)} / mes`;
