import { MonthAnalytics } from '../models/pro-analytics';
import { OwnProfessional, ProTrialSummary } from '../models/pro-profile';
import { formatCount, formatMoney } from './format';

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
          ? 'solicitud nueva te llegó después que a un perfil PRO que también la recibió'
          : 'solicitudes nuevas te llegaron después que a un perfil PRO que también las recibió') +
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
 * Lo aceptado del mes, solo como dato. Es la suma de presupuestos aceptados en Resuelve,
 * no lo cobrado: el texto que lo muestra lo dice. null = sin aceptados.
 */
export function acceptedQuotesAmount(d: MonthAnalytics): string | null {
  const value = Number(d.basic.acceptedQuotesValue ?? d.advanced?.acceptedQuotesValue ?? 0);
  return value > 0 ? formatMoney(value) : null;
}

/** Hechos de Destacados. Los aceptados pertenecen al mes de aceptación, no a una cohorte de solicitudes. */
export function featuredValueFacts(d: MonthAnalytics): ValueFact[] {
  if (d.plan === 'FREE') return [];
  const out: ValueFact[] = [];
  const add = (n: number | undefined, one: string, many: string) => {
    if (n && n > 0) out.push({ value: formatCount(n), text: n === 1 ? one : many });
  };
  add(d.exposure?.featuredImpressions, 'aparición en Destacados', 'apariciones en Destacados');
  const at = d.advanced?.attribution;
  add(at?.featuredAttributedRequests, 'solicitud recibida desde Destacados', 'solicitudes recibidas desde Destacados');
  add(at?.featuredAttributedAccepted, 'presupuesto aceptado de un pedido originado en Destacados', 'presupuestos aceptados de pedidos originados en Destacados');
  return out;
}

/** Acceso anticipado demostrado del mismo pedido, separado de Destacados. */
export function proAccessFacts(d: MonthAnalytics): ValueFact[] {
  const early = d.advanced?.attribution?.earlyAccessOpportunities ?? 0;
  return early > 0 ? [{
    value: formatCount(early),
    text: early === 1 ? 'solicitud nueva que viste antes que los perfiles Free' : 'solicitudes nuevas que viste antes que los perfiles Free',
  }] : [];
}

/** Con PRO: solo hechos registrados; no atribuye causas ni calcula conversión entre meses distintos. */
export function proGainFacts(d: MonthAnalytics): ValueFact[] {
  return [...featuredValueFacts(d), ...proAccessFacts(d)];
}

export interface ObservedGroup {
  key: 'interest' | 'work';
  title: string;
  facts: ValueFact[];
}

const count = (n: number, one: string, many: string): ValueFact => ({ value: formatCount(n), text: n === 1 ? one : many });

/**
 * Lo que pasó en el perfil de un PRO en el mes, separado por lo que cada número significa:
 * interés (apariciones, visitas, toques en WhatsApp/Llamar) y trabajo por Resuelve (presupuestos
 * enviados, aceptados y realizados). Un toque no es una conversación y una conversación no es un
 * trabajo; tampoco decimos que PRO los causó. Solo lo que pasó (sin ceros); vacío = nada que contar.
 */
export function proObservedGroups(d: MonthAnalytics): ObservedGroup[] {
  const out: ObservedGroup[] = [];
  const e = d.exposure;
  const interest: ValueFact[] = [];
  if (e) {
    if (e.impressions > 0) interest.push(count(e.impressions, 'aparición en búsquedas', 'apariciones en búsquedas'));
    if (e.profileViews > 0) interest.push(count(e.profileViews, 'visita a tu perfil', 'visitas a tu perfil'));
    if ((e.whatsappClicks ?? 0) > 0) interest.push(count(e.whatsappClicks!, 'toque en WhatsApp', 'toques en WhatsApp'));
    if ((e.phoneClicks ?? 0) > 0) interest.push(count(e.phoneClicks!, 'toque en Llamar', 'toques en Llamar'));
  }
  if (interest.length) {
    out.push({
      key: 'interest',
      title: 'Interés en tu perfil',
      facts: interest,
    });
  }
  const work: ValueFact[] = [];
  const b = d.basic;
  if (b.quotesSent > 0) work.push(count(b.quotesSent, 'presupuesto enviado', 'presupuestos enviados'));
  if (b.quotesAccepted > 0) work.push(count(b.quotesAccepted, 'presupuesto aceptado por un cliente', 'presupuestos aceptados por clientes'));
  if (b.completedJobs > 0) work.push(count(b.completedJobs, 'trabajo realizado por Resuelve', 'trabajos realizados por Resuelve'));
  if (work.length) {
    out.push({
      key: 'work',
      title: 'Presupuestos y trabajos por Resuelve',
      facts: work,
    });
  }
  return out;
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
 * Acciones sobre el perfil real, incluso con actividad. Primero publicación, después trabajos y
 * presentación. No interpreta un cero como falta de demanda ni promete resultados. Máximo dos.
 * hasWorks undefined = todavía no se sabe; no se pide cargar un trabajo por falta de datos.
 */
export function proZeroDiagnosis(
  d: MonthAnalytics,
  me: Pick<OwnProfessional, 'featured' | 'avatarUrl' | 'coverage' | 'primaryLocality'> | null,
  hasWorks?: boolean,
): ZeroDiagnosis[] {
  if (!me || d.plan === 'FREE') return [];
  const reason = me.featured?.reason;
  if (reason === 'PROFILE_PAUSED') return [{
    text: 'Tu perfil está pausado: no aparece en búsquedas ni en Destacados.',
    cta: { label: 'Reactivar mi perfil', link: '/pro/perfil' },
  }];
  if (reason === 'NO_PUBLIC_SERVICE') return [{
    text: 'Falta un servicio publicado para aparecer en Destacados.',
    cta: { label: 'Revisar mis servicios', link: '/pro/perfil' },
  }];
  if (reason === 'NO_COVERAGE') return [{
    text: 'Falta dónde trabajás para aparecer en las búsquedas de tu zona.',
    cta: { label: 'Cargar mi zona', link: '/pro/perfil' },
  }];
  const out: ZeroDiagnosis[] = [];
  if (hasWorks === false) out.push({
    text: 'Todavía no subiste trabajos. Mostrá lo que hacés con fotos propias.',
    cta: { label: 'Agregar mi primer trabajo', link: '/pro/perfil', fragment: 'profile-portfolio' },
  });
  if (!me.avatarUrl) out.push({
    text: 'Completá tu presentación con una foto de perfil.',
    cta: { label: 'Sumar mi foto', link: '/pro/perfil' },
  });
  const coverage = me.coverage ?? [];
  if (coverage.length && coverage.every((c) => !c.coversEntireCity)) out.push({
    text: 'Revisá si tus barrios cubren todos los lugares donde realmente trabajás.',
    cta: { label: 'Revisar mi cobertura', link: '/pro/perfil' },
  });
  const demand = d.demand;
  if (!out.length && !d.exposure?.featuredImpressions && demand && demand.otherProProfiles > 0) out.push({
    text: `Los espacios Destacados rotan día a día. Hay ${demand.otherProProfiles} ${demand.otherProProfiles === 1 ? 'perfil PRO más' : 'perfiles PRO más'} de ${listOf(demand.services)} en ${demand.locality}.`,
    cta: null,
  });
  return out.slice(0, 2);
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
        d.plan !== 'FREE'
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
