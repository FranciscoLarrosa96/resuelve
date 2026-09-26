import { AdvancedAnalytics } from '../models/pro-analytics';
import { deltaText, monthInsights, monthLabel, rateText, shiftMonth, weekLabel } from './month-analytics';

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
