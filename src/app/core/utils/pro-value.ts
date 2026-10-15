import { MonthAnalytics } from '../models/pro-analytics';
import { OwnProfessional, ProTrialSummary } from '../models/pro-profile';
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

/**
 * El precio de PRO anclado en un trabajo suyo: "Tu presupuesto aceptado más alto en Resuelve
 * ($ 129.000) equivale a 8 meses de PRO." Solo si alcanza al menos un mes; null si no.
 */
export function priceAnchorText(d: MonthAnalytics): string | null {
  const value = Number(d.largestAcceptedQuoteValue ?? 0);
  const price = d.proMonthlyPrice ?? 0;
  if (!(value > 0) || !(price > 0) || value < price) return null;
  const months = Math.floor(value / price);
  return `Tu presupuesto aceptado más alto en Resuelve (${formatMoney(value)}) equivale a ${months} ${months === 1 ? 'mes' : 'meses'} de PRO.`;
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

/** Una razón concreta de por qué un número de PRO sigue en cero, con qué hacer (si hay algo). */
export interface ZeroDiagnosis {
  text: string;
  cta: { label: string; link: string; fragment?: string } | null;
}

const listOf = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;

/**
 * PRO con algún número en cero ("Lo que sumó PRO"): en vez del cero, por qué todavía no
 * pasó y qué puede hacer. Solo con datos reales (elegibilidad del backend, su perfil y la
 * demanda de su zona); nunca promete que va a aparecer ni culpa al plan. Máximo 3 razones.
 */
export function proZeroDiagnosis(
  d: MonthAnalytics,
  me: Pick<OwnProfessional, 'featured' | 'avatarUrl' | 'coverage' | 'primaryLocality'> | null,
): ZeroDiagnosis[] {
  if (!me || d.plan !== 'PRO') return [];
  const out: ZeroDiagnosis[] = [];
  const featured = d.exposure?.featuredImpressions ?? 0;
  const early = d.advanced?.attribution?.earlyAccessOpportunities ?? 0;
  const demand = d.demand ?? null;
  const reason = me.featured?.reason;
  if (featured === 0) {
    if (reason === 'PROFILE_PAUSED') {
      out.push({
        text: 'Tu perfil está pausado: no aparece en búsquedas ni en Destacados.',
        cta: { label: 'Reactivar mi perfil', link: '/pro/perfil' },
      });
    } else if (reason === 'NO_PUBLIC_SERVICE') {
      out.push({
        text: 'No tenés ningún servicio publicado: Destacados se arma con los servicios que ofrecés.',
        cta: { label: 'Revisar mis servicios', link: '/pro/perfil' },
      });
    } else if (reason === 'NO_COVERAGE') {
      out.push({
        text: 'Falta dónde trabajás: Destacados solo muestra perfiles que cubren la zona buscada.',
        cta: { label: 'Cargar mi zona', link: '/pro/perfil' },
      });
    } else {
      if (demand && demand.otherProProfiles > 0) {
        out.push({
          text:
            `Hay ${demand.otherProProfiles} ${demand.otherProProfiles === 1 ? 'perfil PRO más' : 'perfiles PRO más'} ` +
            `de ${listOf(demand.services)} en ${demand.locality}: los espacios Destacados rotan día a día entre todos.`,
          cta: null,
        });
      }
      const coverage = me.coverage ?? [];
      if (coverage.length && coverage.every((c) => !c.coversEntireCity)) {
        out.push({
          text: `Cubrís solo algunos barrios${me.primaryLocality ? ` de ${me.primaryLocality.name}` : ''}: con más barrios entrás en más búsquedas.`,
          cta: { label: 'Sumar barrios', link: '/pro/perfil' },
        });
      }
      if (!me.avatarUrl) {
        out.push({
          text: 'Todavía no tenés foto de perfil: en un espacio Destacado se ve grande.',
          cta: { label: 'Sumar mi foto', link: '/pro/perfil' },
        });
      }
    }
  }
  if (early === 0 && (!demand || demand.requests === 0)) {
    out.push({
      text: 'Todavía no registramos solicitudes que te hayan llegado antes que a perfiles Free. Solo contamos esa ventaja cuando otro perfil recibió el mismo pedido más tarde.',
      cta: null,
    });
  }
  return out.slice(0, 3);
}

/** "La demanda en tu zona": frases con los conteos agregados (nunca quién pidió). null = sin base. */
export function demandFacts(d: MonthAnalytics): { title: string; facts: ValueFact[] } | null {
  const demand = d.demand;
  if (!demand) return null;
  const facts: ValueFact[] = [];
  const received = demand.received;
  if (received !== undefined && received > 0) facts.push({
    value: formatCount(received),
    text: received === 1 ? 'te llegó a vos' : 'te llegaron a vos',
  });
  if (demand.answeredBeforeFree > 0) {
    facts.push({
      value: formatCount(demand.answeredBeforeFree),
      text:
        demand.answeredBeforeFree === 1
          ? 'ya tenía presupuesto antes de que los perfiles Free pudieran verlo'
          : 'ya tenían presupuesto antes de que los perfiles Free pudieran verlos',
    });
  }
  if (demand.otherProProfiles > 0) {
    facts.push({
      value: formatCount(demand.otherProProfiles),
      text:
        d.plan === 'PRO'
          ? demand.otherProProfiles === 1
            ? 'perfil PRO más ofrece tus servicios en tu ciudad'
            : 'perfiles PRO más ofrecen tus servicios en tu ciudad'
          : demand.otherProProfiles === 1
            ? 'perfil PRO ofrece tus servicios en tu ciudad'
            : 'perfiles PRO ofrecen tus servicios en tu ciudad',
    });
  }
  const what = listOf(demand.services);
  return {
    title: `${formatCount(demand.requests)} ${demand.requests === 1 ? 'pedido' : 'pedidos'} de ${what} en ${demand.locality}`,
    facts,
  };
}
