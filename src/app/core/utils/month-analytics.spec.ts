import { AdvancedAnalytics } from '../models/pro-analytics';
import { deltaText, monthInsights, monthJourney, monthLabel, monthNextStep, niceAxis, rateText, responseScalePct, responseTimeText, shiftMonth, weekChart, weekLabel } from './month-analytics';
import { MonthAnalytics } from '../models/pro-analytics';

describe('respuesta', () => {
  it('formatea minutos y horas para lectura humana', () => {
    expect(responseTimeText(null)).toBe('—');
    expect(responseTimeText(24)).toBe('24 min');
    expect(responseTimeText(72)).toBe('1 h 12 min');
    expect(responseTimeText(180)).toBe('3 h');
  });
});

const SEP = { year: 2026, month: 9 };
const AUG = { year: 2026, month: 8 };
const basic = { requestsReceived: 12, quotesSent: 8, quotesAccepted: 5, scheduledJobs: 5, completedJobs: 4, reviewsReceived: 3 };
const row = (name: string, requestsReceived: number) => ({ id: name, name, requestsReceived, quotesSent: 0, quotesAccepted: 0 });

function advanced(patch: Partial<AdvancedAnalytics> = {}): AdvancedAnalytics {
  return {
    acceptedQuotesValue: '1840000.00',
    acceptance: { sent: 8, accepted: 5, rate: 62.5 },
    previous: null,
    weekly: [],
    byService: [row('Electricidad', 9), row('Gas', 3)],
    byZone: [row('Centro', 5), row('Villa Italia', 3)],
    ...patch,
  };
}

describe('Tu mes: reglas de presentación', () => {
  it('meses y semanas en español, cruzando el año', () => {
    expect(monthLabel(SEP)).toBe('septiembre 2026');
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(weekLabel({ fromDay: 29, toDay: 30 }, SEP)).toBe('29–30 sep');
  });

  it('tasa: "—" sin base, nunca "0 %"', () => {
    expect(rateText(null)).toBe('—');
    expect(rateText(62.5)).toBe('62,5 %');
    expect(rateText(0)).toBe('0 %');
  });

  it('comparación en números absolutos, sin porcentajes con base 0', () => {
    expect(deltaText(15, 12, AUG)).toBe('+3 vs. agosto');
    expect(deltaText(2, 4, AUG)).toBe('2 menos que agosto');
    expect(deltaText(3, 3, AUG)).toBe('igual que agosto');
    expect(deltaText(3, 0, AUG)).toBe('+3 vs. agosto');
    expect(deltaText(3, undefined, null)).toBeNull();
  });

  it('insights deterministas solo con datos reales', () => {
    expect(monthInsights(advanced(), basic, SEP)).toEqual([
      'Aceptaron 5 de 8 presupuestos enviados este mes.',
      'Electricidad fue tu servicio con más solicitudes en septiembre.',
      'Centro fue el barrio con más solicitudes.',
    ]);
  });

  it('sin enviados, con empate o con un solo servicio no inventa conclusiones', () => {
    const a = advanced({
      acceptance: { sent: 0, accepted: 0, rate: null },
      byService: [row('Electricidad', 4)],
      byZone: [row('Centro', 2), row('Uncas', 2)],
    });
    expect(monthInsights(a, basic, SEP)).toEqual([]);
  });

  it('suma la comparación con el mes anterior solo si creció', () => {
    const previous = { ...AUG, ...basic, requestsReceived: 9, acceptedQuotesValue: '0.00' };
    expect(monthInsights(advanced({ previous }), basic, SEP)).toContain('Recibiste 3 solicitudes más que en agosto.');
    expect(monthInsights(advanced({ previous: { ...previous, requestsReceived: 12 } }), basic, SEP).join()).not.toContain('Recibiste');
  });
});

describe('Tu mes: gráficos', () => {
  const period = { ...SEP, start: '', end: '', isCurrent: true, earliest: AUG };
  const ent = {
    canSendUnlimitedQuotes: false,
    canBeFeatured: false,
    canUseAdvancedAnalytics: false,
    canSeeExposureAnalytics: false,
    canUseQuoteTemplates: false,
    portfolioPhotoLimit: 5 as const,
  };
  const monthOf = (patch: Partial<MonthAnalytics> = {}): MonthAnalytics => ({
    period,
    plan: 'FREE',
    entitlements: ent,
    basic: { ...basic, currentRating: null, reviewCount: 0 },
    recentReviews: [],
    advanced: null,
    exposure: null,
    ...patch,
  });

  it('eje redondo que siempre cubre el dato', () => {
    expect(niceAxis(15)).toEqual({ max: 15, ticks: [0, 5, 10, 15] });
    expect(niceAxis(1)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceAxis(7)).toEqual({ max: 10, ticks: [0, 5, 10] });
    expect(niceAxis(1284)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] });
    expect(niceAxis(0)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it('Free: apariciones y visitas bloqueadas, sin números ni tasas que no recibe', () => {
    const { rows, axis } = monthJourney(monthOf());
    expect(rows.map((r) => [r.label, r.locked, r.value])).toEqual([
      ['Te vieron en búsquedas', true, 0],
      ['Entraron a tu perfil', true, 0],
      ['Te pidieron presupuesto', false, 12],
      ['Respondiste', false, 8],
      ['Te eligieron', false, 5],
    ]);
    expect(rows.every((r) => r.conv === null)).toBe(true);
    expect(axis.max).toBe(15);
    // La sombra del paso anterior marca la caída (12 → 8).
    expect(rows[3].ghostPct).toBeCloseTo(80);
    expect(rows[3].segments[0].pct).toBeCloseTo((8 / 15) * 100);
  });

  it('PRO: apariciones partidas en Destacados y búsqueda común, sobre la misma escala', () => {
    const { rows } = monthJourney(
      monthOf({
        entitlements: { ...ent, canSeeExposureAnalytics: true },
        basic: {
          ...basic,
          requestsReceived: 1,
          quotesSent: 1,
          quotesAccepted: 1,
          currentRating: null,
          reviewCount: 0,
        },
        exposure: {
          impressions: 15,
          featuredImpressions: 13,
          profileViews: 5,
          rates: { viewsPerImpression: 33.3, requestsPerView: 20, acceptance: 100 },
          previous: null,
        },
      }),
    );
    expect(rows[0].sub).toBe('13 en Destacados');
    expect(rows[0].segments.map((s) => [s.kind, Math.round(s.pct)])).toEqual([
      ['featured', 87],
      ['organic', 13],
    ]);
    expect(rows[1].conv).toBe('33,3 % de los que te vieron');
    expect(rows[4]).toMatchObject({ win: true, conv: '100 % de tus presupuestos' });
  });

  it('semanas: lo que no pasó no es 0, y se marca hoy', () => {
    const weekly = [
      { fromDay: 1, toDay: 7, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
      { fromDay: 8, toDay: 14, requestsReceived: 1, quotesSent: 1, completedJobs: 0 },
      { fromDay: 15, toDay: 21, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
      { fromDay: 22, toDay: 28, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
      { fromDay: 29, toDay: 30, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
    ];
    const w = weekChart(weekly, 'requestsReceived', period, 8);
    expect(w.bins.map((b) => [b.future, b.current])).toEqual([
      [false, false],
      [false, true],
      [true, false],
      [true, false],
      [true, false],
    ]);
    expect(w.columns).toBe('7fr 7fr 7fr 7fr 2fr');
    expect(w.best).toBe('8–14 sep');
    expect(w.daysLeft).toBe(22);
    expect(w.futureFromPct).toBeCloseTo((14 / 30) * 100);
    // Mes cerrado: todo pasó, sin "hoy".
    const closed = weekChart(weekly, 'requestsReceived', { ...period, isCurrent: false }, 8);
    expect(closed.bins.some((b) => b.future)).toBe(false);
    expect(closed.todayPct).toBeNull();
    expect(weekChart(weekly, 'completedJobs', period, 8).best).toBeNull();
  });

  it('regla de respuesta logarítmica de 30 s a 1 día', () => {
    expect(responseScalePct(0)).toBe(0);
    expect(responseScalePct(24 * 60)).toBe(100);
    expect(responseScalePct(1)).toBeCloseTo(8.7, 1);
  });

  it('próximo paso: una acción real del mes en curso', () => {
    const b = { ...basic, currentRating: null, reviewCount: 0 };
    expect(
      monthNextStep({ period, basic: { ...b, scheduledJobs: 1, reviewsReceived: 0 } }),
    ).toMatchObject({
      title: 'Terminá el trabajo agendado y pedí la reseña',
      link: '/pro/agenda',
    });
    expect(
      monthNextStep({
        period,
        basic: { ...b, scheduledJobs: 0, completedJobs: 2, reviewsReceived: 0 },
      })?.title,
    ).toBe('Pedí la reseña de tus trabajos realizados');
    expect(
      monthNextStep({
        period,
        basic: { ...b, scheduledJobs: 0, completedJobs: 0, requestsReceived: 3, quotesSent: 1 },
      })?.link,
    ).toBe('/pro/solicitudes');
    expect(monthNextStep({ period: { ...period, isCurrent: false }, basic: b })).toBeNull();
  });
});
