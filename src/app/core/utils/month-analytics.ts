import { AdvancedAnalytics, ExposureAnalytics, MonthAnalytics, MonthCounts, MonthRef, WeekActivity } from '../models/pro-analytics';
import { formatCount, pluralize } from './format';

/** Reglas de presentación de "Tu mes". Deterministas (sin IA) y solo con datos reales. */

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const monthName = (m: MonthRef): string => MONTH_NAMES[m.month - 1];
/** "septiembre 2026" */
export const monthLabel = (m: MonthRef): string => `${monthName(m)} ${m.year}`;

export const shiftMonth = (m: MonthRef, delta: number): MonthRef => {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
export const monthKey = (m: MonthRef): number => m.year * 12 + m.month;

/** "1–7 sep" */
export function weekLabel(w: Pick<WeekActivity, 'fromDay' | 'toDay'>, m: MonthRef): string {
  return `${w.fromDay}–${w.toDay} ${monthName(m).slice(0, 3)}`;
}

/** 62,5 % · null (sin enviados) = "—", nunca "0 %". */
export function rateText(rate: number | null): string {
  if (rate === null) return '—';
  return `${String(rate).replace('.', ',')} %`;
}

export function responseTimeText(minutes: number | null): string {
  if (minutes === null) return '—';
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Diferencia contra el mes anterior en números absolutos, nunca en %
 * (con base 0 un porcentaje no significa nada). Sin comparación → null.
 * "+3 vs. agosto" · "2 menos que agosto" · "igual que agosto"
 */
export function deltaText(current: number, previous: number | undefined, prev: MonthRef | null): string | null {
  if (previous === undefined || !prev) return null;
  const diff = current - previous;
  const name = monthName(prev);
  if (diff === 0) return `igual que ${name}`;
  return diff > 0 ? `+${diff} vs. ${name}` : `${-diff} menos que ${name}`;
}

/** Hay algo para mostrar este mes (si no, empty state "Tu mes recién empieza"). */
export function hasActivity(a: Pick<MonthAnalytics, 'basic'> & Partial<Pick<MonthAnalytics, 'exposure'>>): boolean {
  const b = a.basic;
  const e = a.exposure;
  return [
    b.requestsReceived,
    b.quotesSent,
    b.quotesAccepted,
    b.scheduledJobs,
    b.completedJobs,
    b.reviewsReceived,
    e?.impressions ?? 0,
    e?.profileViews ?? 0,
  ].some((n) => n > 0);
}

/** El primero de la lista, solo si le gana claramente al segundo (sin empates inventados). */
function clearLeader<T extends { requestsReceived: number }>(rows: T[]): T | null {
  const [first, second] = rows;
  if (!first || first.requestsReceived === 0) return null;
  if (second && second.requestsReceived >= first.requestsReceived) return null;
  return rows.length > 1 ? first : null;
}

/**
 * Frases para PRO, derivadas de los números del mes con reglas fijas:
 * - aceptación sobre la misma base ("Aceptaron 5 de tus 8 presupuestos");
 * - servicio y barrio con más solicitudes, solo si hay más de uno y sin empate;
 * - más solicitudes que el mes anterior, solo si hay comparación;
 * - más visitas al perfil que el mes anterior (con exposición), solo si subieron.
 */
export function monthInsights(
  a: AdvancedAnalytics,
  basic: MonthCounts,
  period: MonthRef,
  exposure: ExposureAnalytics | null = null,
): string[] {
  const out: string[] = [];
  const { sent, accepted } = a.acceptance;
  if (sent > 0) out.push(`Aceptaron ${accepted} de ${pluralize(sent, 'presupuesto enviado', 'presupuestos enviados')} este mes.`);
  if (a.response && a.response.opportunities > 0 && !a.response.answered) {
    out.push(`Recibiste ${pluralize(a.response.opportunities, 'oportunidad', 'oportunidades')} y todavía no enviaste presupuestos para ellas.`);
  }
  if (a.response?.medianMinutes !== null && a.response?.medianMinutes !== undefined &&
      a.response.previous.medianMinutes !== null && a.response.medianMinutes < a.response.previous.medianMinutes) {
    out.push(`Tu respuesta mediana bajó de ${responseTimeText(a.response.previous.medianMinutes)} a ${responseTimeText(a.response.medianMinutes)}.`);
  }
  if (a.attribution?.earlyAccessOpportunities) {
    out.push(`${pluralize(a.attribution.earlyAccessOpportunities, 'oportunidad', 'oportunidades')} estuvieron disponibles para vos durante el acceso anticipado PRO.`);
  }
  const service = clearLeader(a.byService);
  if (service) out.push(`${service.name} fue tu servicio con más solicitudes en ${monthName(period)}.`);
  const zone = clearLeader(a.byZone);
  if (zone) out.push(`${zone.name} fue el barrio con más solicitudes.`);
  if (a.previous && basic.requestsReceived > a.previous.requestsReceived) {
    const diff = basic.requestsReceived - a.previous.requestsReceived;
    out.push(`Recibiste ${pluralize(diff, 'solicitud', 'solicitudes')} más que en ${monthName(a.previous)}.`);
  }
  // Visitas al perfil contra el mes anterior: en números absolutos y solo si subieron.
  if (exposure?.previous && exposure.profileViews > exposure.previous.profileViews) {
    const diff = exposure.profileViews - exposure.previous.profileViews;
    out.push(`Tu perfil recibió ${pluralize(diff, 'visita', 'visitas')} más que en ${monthName(shiftMonth(period, -1))}.`);
  }
  return out;
}

/**
 * Eje lineal "redondo" para los gráficos de Tu mes: 3 o 4 marcas enteras
 * (0 / 5 / 10 / 15 · 0 / 500 / 1.000 / 1.500). El máximo del eje nunca es menor
 * que el dato, así ninguna barra se pasa del gráfico.
 */
export function niceAxis(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!,
  );
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { max: top, ticks };
}

export interface JourneySegment {
  kind: 'featured' | 'organic' | 'base' | 'win';
  /** Ancho sobre el eje (0–100). */
  pct: number;
  tip: string;
}

export interface JourneyRow {
  label: string;
  value: number;
  /** Detalle bajo el nombre del paso: destacados, tiempo de respuesta, comparación. */
  sub: string;
  /** Conversión desde el paso anterior, solo con base real ("33,3 % de los que te vieron"). */
  conv: string | null;
  segments: JourneySegment[];
  /** Ancho del paso anterior cuando fue mayor: muestra cuánto se cayó en este paso. */
  ghostPct: number | null;
  locked: boolean;
  win: boolean;
}

/**
 * "Del primer vistazo al trabajo": apariciones (destacadas + comunes) → visitas →
 * solicitudes → presupuestos → aceptados, todos sobre la MISMA escala lineal.
 * Free no recibe exposición: esos dos pasos van bloqueados ("Lo ves con PRO"),
 * sin números. Cada paso es un conteo propio (no personas únicas), así que un paso
 * puede ser mayor que el anterior: no se fuerza un embudo decreciente.
 */
export function monthJourney(d: MonthAnalytics): {
  rows: JourneyRow[];
  axis: { max: number; ticks: number[] };
} {
  const e = d.exposure;
  const b = d.basic;
  const a = d.advanced;
  const prevMonth = shiftMonth(d.period, -1);
  const basicDelta = (key: keyof MonthCounts) =>
    a?.previous ? deltaText(b[key], a.previous[key], a.previous) : null;
  const exposureDelta = (key: 'impressions' | 'profileViews') =>
    e?.previous ? deltaText(e[key], e.previous[key], prevMonth) : null;
  const sub = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  const rate = (value: number | null | undefined, text: string) =>
    value === null || value === undefined ? null : `${rateText(value)} ${text}`;

  type Draft = Omit<JourneyRow, 'segments' | 'ghostPct'> & { featured?: number };
  const drafts: Draft[] = [];
  const locked = (label: string): Draft => ({
    label,
    value: 0,
    sub: '',
    conv: null,
    locked: true,
    win: false,
  });
  if (e) {
    drafts.push({
      label: 'Te vieron en búsquedas',
      value: e.impressions,
      sub: sub(
        e.featuredImpressions ? `${formatCount(e.featuredImpressions)} en Destacados` : null,
        exposureDelta('impressions'),
      ),
      conv: null,
      featured: e.featuredImpressions,
      locked: false,
      win: false,
    });
    drafts.push({
      label: 'Entraron a tu perfil',
      value: e.profileViews,
      sub: sub(exposureDelta('profileViews')),
      conv: rate(e.rates.viewsPerImpression, 'de los que te vieron'),
      locked: false,
      win: false,
    });
  } else if (!d.entitlements.canSeeExposureAnalytics) {
    drafts.push(locked('Te vieron en búsquedas'), locked('Entraron a tu perfil'));
  }
  drafts.push({
    label: 'Te pidieron presupuesto',
    value: b.requestsReceived,
    sub: sub(basicDelta('requestsReceived')),
    conv: rate(e?.rates.requestsPerView, 'de las visitas'),
    locked: false,
    win: false,
  });
  const median = a?.response?.medianMinutes;
  drafts.push({
    label: 'Respondiste',
    value: b.quotesSent,
    sub: sub(
      median !== null && median !== undefined ? `en ${responseTimeText(median)}` : null,
      basicDelta('quotesSent'),
    ),
    conv: a?.response?.opportunities
      ? rate(a.response.rate, 'de las oportunidades respondidas')
      : null,
    locked: false,
    win: false,
  });
  drafts.push({
    label: 'Te eligieron',
    value: b.quotesAccepted,
    sub: sub(basicDelta('quotesAccepted')),
    conv: rate(
      e?.rates.acceptance ?? (a?.acceptance.sent ? a.acceptance.rate : null),
      'de tus presupuestos',
    ),
    locked: false,
    win: true,
  });

  const axis = niceAxis(Math.max(0, ...drafts.filter((r) => !r.locked).map((r) => r.value)));
  const pct = (v: number) => (v / axis.max) * 100;
  let previous: number | null = null;
  const rows = drafts.map(({ featured, ...r }): JourneyRow => {
    const ghostPct = !r.locked && previous !== null && previous > r.value ? pct(previous) : null;
    if (!r.locked) previous = r.value;
    let segments: JourneySegment[] = [];
    if (r.locked || !r.value) segments = [];
    else if (featured) {
      const organic = r.value - featured;
      segments = [
        {
          kind: 'featured',
          pct: pct(featured),
          tip: `${formatCount(featured)} en Destacados (PRO)`,
        },
      ];
      if (organic > 0)
        segments.push({
          kind: 'organic',
          pct: pct(organic),
          tip: `${formatCount(organic)} en búsqueda común`,
        });
    } else {
      segments = [
        {
          kind: r.win ? 'win' : 'base',
          pct: pct(r.value),
          tip: `${r.label}: ${formatCount(r.value)}`,
        },
      ];
    }
    return { ...r, segments, ghostPct };
  });
  return { rows, axis };
}

/** Posición (0–100) de un tiempo de respuesta en una regla logarítmica de 30 s a 1 día. */
export function responseScalePct(minutes: number): number {
  const min = 0.5;
  const max = 24 * 60;
  const m = Math.min(max, Math.max(min, minutes));
  return (Math.log(m / min) / Math.log(max / min)) * 100;
}

export interface WeekBin {
  label: string;
  value: number;
  /** Días del tramo: el ancho de la columna es proporcional (29–31 es más angosto). */
  days: number;
  heightPct: number;
  /** Mes en curso: el tramo todavía no empezó (no se dibuja un 0 que no pasó). */
  future: boolean;
  current: boolean;
}

/**
 * Columnas por semana del mes. En el mes en curso, los tramos que todavía no
 * empezaron no muestran 0 (quedan rayados como "Todavía no pasó") y se marca hoy.
 */
export function weekChart(
  weekly: WeekActivity[],
  key: 'requestsReceived' | 'quotesSent' | 'completedJobs',
  period: MonthAnalytics['period'],
  today: number | null,
) {
  const day = period.isCurrent ? today : null;
  const daysInMonth = weekly.at(-1)?.toDay ?? 30;
  const raw = weekly.map((w) => ({
    label: weekLabel(w, period),
    value: w[key],
    days: w.toDay - w.fromDay + 1,
    future: day !== null && w.fromDay > day,
    current: day !== null && w.fromDay <= day && day <= w.toDay,
  }));
  const past = raw.filter((w) => !w.future);
  const axis = niceAxis(Math.max(0, ...past.map((w) => w.value)));
  const bins: WeekBin[] = raw.map((w) => ({
    ...w,
    heightPct: w.future ? 0 : (w.value / axis.max) * 100,
  }));
  const total = past.reduce((sum, w) => sum + w.value, 0);
  const top = Math.max(0, ...past.map((w) => w.value));
  const leaders = past.filter((w) => w.value === top);
  const firstFuture = weekly.find((w) => day !== null && w.fromDay > day);
  return {
    bins,
    axis,
    columns: bins.map((w) => `${w.days}fr`).join(' '),
    total,
    /** Solo si hay una semana que le gana a las demás. */
    best: total > 0 && leaders.length === 1 ? leaders[0].label : null,
    todayPct: day !== null ? ((day - 0.5) / daysInMonth) * 100 : null,
    futureFromPct: firstFuture ? ((firstFuture.fromDay - 1) / daysInMonth) * 100 : null,
    daysLeft: day !== null ? daysInMonth - day : null,
  };
}

export interface NextStep {
  title: string;
  text: string;
  link: string;
  cta: string;
}

/** Una sola acción concreta para el mes en curso, derivada de los conteos reales. Sin regla que aplique: nada. */
export function monthNextStep(d: Pick<MonthAnalytics, 'basic' | 'period'>): NextStep | null {
  if (!d.period.isCurrent) return null;
  const b = d.basic;
  const noReviews = b.reviewsReceived === 0 ? 'No tenés reseñas este mes. ' : '';
  if (b.scheduledJobs > 0) {
    const many = b.scheduledJobs > 1;
    return {
      title: many
        ? 'Terminá los trabajos agendados y pedí las reseñas'
        : 'Terminá el trabajo agendado y pedí la reseña',
      text: `${noReviews}Cuando pase el horario, ${many ? 'marcalos realizados y pedile la reseña a cada cliente' : 'marcalo realizado y pedile la reseña al cliente'}: suma a tu puntaje y ayuda a que te elijan.`,
      link: '/pro/agenda',
      cta: 'Ir a la Agenda',
    };
  }
  if (b.completedJobs > 0 && b.reviewsReceived === 0) {
    return {
      title: 'Pedí la reseña de tus trabajos realizados',
      text: 'Una reseña de un trabajo por Resuelve suma a tu puntaje y ayuda a que el próximo cliente te elija.',
      link: '/pro/agenda',
      cta: 'Ir a la Agenda',
    };
  }
  if (b.requestsReceived > b.quotesSent) {
    return {
      title: 'Revisá tus solicitudes',
      text: `Recibiste ${pluralize(b.requestsReceived, 'solicitud', 'solicitudes')} y enviaste ${pluralize(b.quotesSent, 'presupuesto', 'presupuestos')}. Responder rápido es lo que más pesa para que te elijan.`,
      link: '/pro/solicitudes',
      cta: 'Ver solicitudes',
    };
  }
  return null;
}

export type WeekChart = ReturnType<typeof weekChart>;
