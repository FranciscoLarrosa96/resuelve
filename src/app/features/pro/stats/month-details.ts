import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AdvancedAnalytics, BreakdownRow } from '../../../core/models/pro-analytics';
import { pluralize } from '../../../core/utils/format';
import { rateText, responseScalePct, responseTimeText } from '../../../core/utils/month-analytics';

/** Marcas de la regla de respuesta (logarítmica, de 30 s a 1 día). */
const RESPONSE_TICKS = [
  { label: '1 min', minutes: 1 },
  { label: '15 min', minutes: 15 },
  { label: '1 h', minutes: 60 },
  { label: '1 día', minutes: 24 * 60 },
].map((t) => ({ label: t.label, pct: responseScalePct(t.minutes) }));

/** Barrios que se listan; el resto se resume en una línea. */
const ZONE_ROWS = 5;

/** Conversión entre pasos de un servicio, solo cuando tiene base y no pasa del 100 %. */
function serviceSteps(r: BreakdownRow) {
  const step = (from: number, to: number) =>
    from > 0 && to <= from ? `${Math.round((to / from) * 100)} %` : null;
  return {
    toQuotes: step(r.requestsReceived, r.quotesSent),
    toAccepted: step(r.quotesSent, r.quotesAccepted),
  };
}

/** "Cómo lo hiciste" (PRO): tiempo de respuesta, barrios y servicios del mes. */
@Component({
  selector: 'app-month-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-details.html',
  styleUrl: './month-details.css',
})
export class MonthDetails {
  readonly advanced = input.required<AdvancedAnalytics>();
  protected readonly plural = pluralize;
  protected readonly rateText = rateText;
  protected readonly responseTimeText = responseTimeText;
  protected readonly responsePct = responseScalePct;
  protected readonly responseTicks = RESPONSE_TICKS;

  /** Barrios con su parte del total de solicitudes del mes. */
  protected readonly zones = computed(() => {
    const rows = this.advanced().byZone;
    const total = rows.reduce((sum, r) => sum + r.requestsReceived, 0);
    return {
      rows: rows.slice(0, ZONE_ROWS).map((r) => ({
        ...r,
        share: total ? Math.round((r.requestsReceived / total) * 100) : 0,
      })),
      more: Math.max(0, rows.length - ZONE_ROWS),
    };
  });
  /** El servicio con más solicitudes va con su recorrido; el resto, en una línea cada uno. */
  protected readonly services = computed(() => {
    const [top, ...rest] = this.advanced().byService;
    return top ? { top: { ...top, ...serviceSteps(top) }, rest: rest.slice(0, 3) } : null;
  });
}
