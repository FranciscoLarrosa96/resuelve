import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { MonthAnalytics, MonthCounts, MonthRef, WeekActivity } from '../../../core/models/pro-analytics';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { formatCount, formatMoney, oneDecimal, pluralize } from '../../../core/utils/format';
import {
  deltaText,
  hasActivity,
  monthInsights,
  monthKey,
  monthLabel,
  monthFunnel,
  monthName,
  rateText,
  shiftMonth,
  weekLabel,
} from '../../../core/utils/month-analytics';
import { NO_REVIEWS_TEXT, reviewsLabel } from '../../../core/utils/reputation';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Stars } from '../../../shared/components/stars/stars';

export const MONTH_ERROR = 'No pudimos cargar tu mes. Revisá tu conexión e intentá de nuevo.';

type WeekMetric = keyof Pick<WeekActivity, 'requestsReceived' | 'quotesSent' | 'completedJobs'>;

export const WEEK_METRICS: { key: WeekMetric; label: string }[] = [
  { key: 'requestsReceived', label: 'Solicitudes' },
  { key: 'quotesSent', label: 'Presupuestos' },
  { key: 'completedJobs', label: 'Trabajos realizados' },
];

/**
 * "Tu mes": actividad REAL del mes calendario (hora de Argentina), agregada
 * por el backend (GET /pro/analytics/month). Free ve lo básico; el análisis
 * detallado y la exposición llegan solo si el backend los manda
 * (`canUseAdvancedAnalytics`, `canSeeExposureAnalytics`).
 * Sin datos: cargando, error con reintento o "Tu mes recién empieza". Nunca ejemplos.
 */
@Component({
  selector: 'app-pro-stats-page',
  imports: [RouterLink, BackButton, Stars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-stats-page.html',
})
export class ProStatsPage {
  private readonly api = inject(ProAnalyticsApiService);
  private readonly backNav = inject(BackNavigation);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sub?: Subscription;

  protected readonly data = signal<MonthAnalytics | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** null = mes en curso (lo decide el backend). */
  private readonly requested = signal<MonthRef | null>(null);
  protected readonly metric = signal<WeekMetric>('requestsReceived');

  protected readonly metrics = WEEK_METRICS;
  protected readonly money = formatMoney;
  protected readonly rateText = rateText;
  protected readonly noReviews = NO_REVIEWS_TEXT;
  protected readonly reviewsLabel = reviewsLabel;
  protected readonly plural = pluralize;
  protected readonly count = formatCount;

  protected readonly period = computed(() => this.data()?.period ?? null);
  protected readonly title = computed(() => {
    const p = this.period() ?? this.requested();
    return p ? `Tu mes · ${monthName(p)}` : 'Tu mes';
  });
  protected readonly subtitle = computed(() => {
    const p = this.period();
    return p ? (p.isCurrent ? `${monthLabel(p)} · hasta hoy` : monthLabel(p)) : '';
  });
  protected readonly prevMonth = computed(() => {
    const p = this.period();
    if (!p) return null;
    const prev = shiftMonth(p, -1);
    return monthKey(prev) >= monthKey(p.earliest) ? prev : null;
  });
  protected readonly nextMonth = computed(() => {
    const p = this.period();
    return p && !p.isCurrent ? shiftMonth(p, 1) : null;
  });
  protected readonly monthName = monthName;

  protected readonly empty = computed(() => {
    const d = this.data();
    return !!d && !hasActivity(d);
  });
  protected readonly advanced = computed(() => this.data()?.advanced ?? null);
  /** PRO: apariciones, visitas y embudo reales (null en Free). */
  protected readonly exposure = computed(() => this.data()?.exposure ?? null);
  protected readonly funnel = computed(() => {
    const d = this.data();
    return d?.exposure ? monthFunnel(d.exposure, d.basic) : [];
  });

  /** Apariciones / visitas contra el mes anterior (solo si ese mes tuvo registros). */
  protected exposureDelta(key: 'impressions' | 'profileViews'): string | null {
    const d = this.data();
    const prev = d?.exposure?.previous;
    return d?.exposure && prev ? deltaText(d.exposure[key], prev[key], shiftMonth(d.period, -1)) : null;
  }

  protected readonly rating = computed(() => {
    const b = this.data()?.basic;
    return b && b.currentRating !== null && b.reviewCount > 0
      ? { value: oneDecimal(b.currentRating), count: reviewsLabel(b.reviewCount) }
      : null;
  });
  protected readonly insights = computed(() => {
    const d = this.data();
    return d?.advanced ? monthInsights(d.advanced, d.basic, d.period) : [];
  });

  /** Comparación contra el mes anterior (solo PRO y solo si hubo actividad para comparar). */
  protected delta(key: keyof MonthCounts): string | null {
    const d = this.data();
    const prev = d?.advanced?.previous ?? null;
    return d && prev ? deltaText(d.basic[key], prev[key], prev) : null;
  }

  protected readonly metricLabel = computed(() => WEEK_METRICS.find((m) => m.key === this.metric())!.label);
  protected readonly bars = computed(() => {
    const d = this.data();
    if (!d?.advanced) return [];
    const key = this.metric();
    const max = Math.max(1, ...d.advanced.weekly.map((w) => w[key]));
    return d.advanced.weekly.map((w) => ({
      label: weekLabel(w, d.period),
      value: w[key],
      pct: (w[key] / max) * 100,
    }));
  });

  constructor() {
    this.load();
  }

  protected load(month: MonthRef | null = this.requested()): void {
    if (!this.isBrowser) return;
    this.requested.set(month);
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.api.getMonth(month ?? undefined).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.data.set(null);
        this.error.set(MONTH_ERROR);
        this.loading.set(false);
      },
    });
  }

  protected go(month: MonthRef | null): void {
    if (month) this.load(month);
  }

  protected back(): void {
    this.backNav.back('/pro/dashboard');
  }
}
