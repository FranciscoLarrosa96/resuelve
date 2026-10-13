import { MonthAnalytics } from '../models/pro-analytics';
import { ProTrialSummary } from '../models/pro-profile';
import { formatCount, formatMoney, oneDecimal } from './format';
import { proPriceAmount } from './quote-usage';

/**
 * Lo que PRO cambió (o habría cambiado) en el mes, con hechos registrados y nada más:
 * sin promesas de clientes ni de posición, sin decir que PRO causó un resultado.
 * Única fuente de estas frases (Inicio, Tu mes y Mi plan).
 */
export interface ValueFact {
  /** Número destacado ("3", "$ 240.000"). */
  value: string;
  text: string;
}

/** Sin PRO: lo que pasó este mes por no tenerlo. Vacío = nada que contar. */
export function withoutProFacts(d: MonthAnalytics): ValueFact[] {
  const p = d.proPreview;
  if (!p) return [];
  const out: ValueFact[] = [];
  if (p.delayedOpportunities > 0) {
    out.push({
      value: formatCount(p.delayedOpportunities),
      text:
        (p.delayedOpportunities === 1
          ? 'solicitud nueva te llegó después que a los perfiles PRO'
          : 'solicitudes nuevas te llegaron después que a los perfiles PRO') +
        (p.delayedAfterOtherQuote > 0
          ? p.delayedOpportunities === 1
            ? '; ya tenía un presupuesto de otro profesional.'
            : `; en ${formatCount(p.delayedAfterOtherQuote)} ya había un presupuesto de otro profesional.`
          : '.'),
    });
  }
  if (p.blockedOpportunities > 0) {
    out.push({
      value: formatCount(p.blockedOpportunities),
      text:
        p.blockedOpportunities === 1
          ? 'solicitud nueva que no pudiste responder porque usaste tus oportunidades Free.'
          : 'solicitudes nuevas que no pudiste responder porque usaste tus oportunidades Free.',
    });
  }
  return out;
}

/**
 * Lo aceptado del mes contra el precio de PRO. Es la suma de presupuestos aceptados en
 * Resuelve, no lo cobrado: el texto lo dice. null = sin aceptados o sin precio.
 */
export function acceptedVsPrice(d: MonthAnalytics): { accepted: string; price: string; perDay: string } | null {
  const value = Number(d.basic.acceptedQuotesValue ?? d.advanced?.acceptedQuotesValue ?? 0);
  const price = d.proMonthlyPrice ?? 0;
  if (!(value > 0) || !(price > 0)) return null;
  return {
    accepted: formatMoney(value),
    price: proPriceAmount(price),
    perDay: proPriceAmount(Math.round(price / 30)),
  };
}

/** Con PRO: lo que sumó este mes (solo lo que pasó, sin ceros), contado sin atribuirle causas. */
export function proGainFacts(d: MonthAnalytics): ValueFact[] {
  const out: ValueFact[] = [];
  const featured = d.exposure?.featuredImpressions ?? 0;
  if (featured > 0) {
    out.push({
      value: formatCount(featured),
      text: featured === 1 ? 'aparición en Destacados' : 'apariciones en Destacados',
    });
  }
  const early = d.advanced?.attribution?.earlyAccessOpportunities ?? 0;
  if (early > 0) {
    out.push({
      value: formatCount(early),
      text: early === 1 ? 'solicitud nueva que viste antes que los perfiles Free' : 'solicitudes nuevas que viste antes que los perfiles Free',
    });
  }
  const fromFeatured = d.advanced?.attribution?.featuredAttributedRequests ?? 0;
  if (fromFeatured > 0) {
    out.push({
      value: formatCount(fromFeatured),
      text: fromFeatured === 1 ? 'solicitud llegó desde un espacio Destacado' : 'solicitudes llegaron desde un espacio Destacado',
    });
  }
  return out;
}

/** "Lo que te aceptaron este mes equivale a 16 veces el precio de PRO." (solo PRO, con base). */
export function priceMultipleText(d: MonthAnalytics): string | null {
  const m = d.advanced?.planPriceMultiple;
  if (!m || m < 1) return null;
  const times = Number.isInteger(m) ? String(m) : oneDecimal(m);
  return `Lo que te aceptaron este mes (${formatMoney(d.advanced!.acceptedQuotesValue)}) equivale a ${times} veces el precio de PRO.`;
}

/**
 * Lo que pasó durante la prueba de PRO, con sus números del período (`GET
 * /pro/plan/trial/summary`): solo lo que pasó (sin ceros), contado sin decir que
 * PRO lo causó ni prometer nada. Vacío = nada que contar.
 */
export function trialSummaryFacts(s: ProTrialSummary): ValueFact[] {
  const out: ValueFact[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) out.push({ value: formatCount(n), text: n === 1 ? one : many });
  };
  add(s.featuredImpressions, 'aparición en Destacados', 'apariciones en Destacados');
  add(
    s.earlyOpportunities,
    'solicitud nueva que viste antes que los perfiles Free',
    'solicitudes nuevas que viste antes que los perfiles Free',
  );
  add(s.profileViews, 'visita a tu perfil', 'visitas a tu perfil');
  add(
    s.quotesAboveFreeLimit,
    'presupuesto que mandaste por encima del cupo Free',
    'presupuestos que mandaste por encima del cupo Free',
  );
  return out;
}
