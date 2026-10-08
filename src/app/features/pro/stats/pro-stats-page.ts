import { AcquisitionMonth } from '../../../shared/components/acquisition/acquisition-month';
import { TabsDirective } from '../../../shared/directives/tabs.directive';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import {
  MonthAnalytics,
  MonthCounts,
  MonthRef,
  WeekActivity,
} from '../../../core/models/pro-analytics';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { businessDay, dayNumber } from '../../../core/utils/business-time';
import { formatCount, formatMoney, oneDecimal, pluralize } from '../../../core/utils/format';
import {
  deltaText,
  hasActivity,
  monthJourney,
  monthKey,
  monthLabel,
  monthName,
  monthNextStep,
  rateText,
  responseTimeText,
  shiftMonth,
  weekChart,
} from '../../../core/utils/month-analytics';
import { NO_REVIEWS_TEXT, reviewsLabel } from '../../../core/utils/reputation';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Stars } from '../../../shared/components/stars/stars';
import { Icon } from '../../../shared/components/icon/icon';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';
import { MonthDetails } from './month-details';
import { MonthJourney } from './month-journey';
import { MonthWeeks } from './month-weeks';

export const MONTH_ERROR = 'No pudimos cargar tu mes. Revisá tu conexión e intentá de nuevo.';

type WeekMetric = keyof Pick<WeekActivity, 'requestsReceived' | 'quotesSent' | 'completedJobs'>;

export const WEEK_METRICS: { key: WeekMetric; label: string; one: string; many: string }[] = [
  { key: 'requestsReceived', label: 'Solicitudes', one: 'solicitud', many: 'solicitudes' },
  { key: 'quotesSent', label: 'Presupuestos', one: 'presupuesto', many: 'presupuestos' },
  {
    key: 'completedJobs',
    label: 'Trabajos realizados',
    one: 'trabajo realizado',
    many: 'trabajos realizados',
  },
];

/**
 * "Tu mes": actividad REAL del mes calendario (hora de Argentina), agregada
 * por el backend (GET /pro/analytics/month). Una sola historia de arriba abajo:
 * te vieron → te eligieron (misma escala en todos los pasos) → cómo lo hiciste →
 * qué sumó PRO → qué sigue. Free ve lo básico; el análisis detallado y la
 * exposición llegan solo si el backend los manda (`canUseAdvancedAnalytics`,
 * `canSeeExposureAnalytics`). Sin datos: cargando, error con reintento o
 * "Tu mes recién empieza". Nunca ejemplos.
 */
@Component({
  selector: 'app-pro-stats-page',
  imports: [
    AcquisitionMonth,
    TabsDirective,
    RouterLink,
    BackButton,
    Stars,
    Icon,
    ProBadge,
    MonthDetails,
    MonthJourney,
    MonthWeeks,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-stats-page.html',
  styleUrl: './pro-stats-page.css',
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
  protected readonly responseTimeText = responseTimeText;
  protected readonly noReviews = NO_REVIEWS_TEXT;
  protected readonly plural = pluralize;
  protected readonly count = formatCount;
  protected readonly monthName = monthName;
  protected readonly monthLabel = monthLabel;

  /** "Te vieron 15 veces y un cliente te eligió." — solo con lo que pasó. */
  protected readonly heroTitle = computed(() => {
    const d = this.data();
    if (!d) return '';
    const seen = d.exposure?.impressions ?? 0;
    const chosen = d.basic.quotesAccepted;
    const asked = d.basic.requestsReceived;
    const chosenText =
      chosen === 1 ? 'un cliente te eligió' : `${formatCount(chosen)} clientes te eligieron`;
    if (seen && chosen)
      return `Te vieron ${formatCount(seen)} ${seen === 1 ? 'vez' : 'veces'} y ${chosenText}.`;
    if (seen) return `Te vieron ${formatCount(seen)} ${seen === 1 ? 'vez' : 'veces'} este mes.`;
    if (asked && chosen)
      return `Te pidieron ${pluralize(asked, 'presupuesto', 'presupuestos')} y ${chosenText}.`;
    if (chosen) return `${chosenText[0].toUpperCase()}${chosenText.slice(1)} este mes.`;
    if (asked) return `Te pidieron ${pluralize(asked, 'presupuesto', 'presupuestos')} este mes.`;
    return 'Tu actividad, paso a paso.';
  });
  protected readonly heroDetail = computed(() => {
    const d = this.data();
    if (!d) return '';
    const median = d.advanced?.response?.medianMinutes;
    const completed = this.delta('completedJobs');
    return [
      median !== null && median !== undefined ? `Respondiste en ${responseTimeText(median)}` : null,
      pluralize(d.basic.completedJobs, 'trabajo realizado', 'trabajos realizados') +
        (completed ? ` (${completed})` : ''),
      pluralize(d.basic.scheduledJobs, 'trabajo agendado', 'trabajos agendados'),
    ]
      .filter(Boolean)
      .join(' · ');
  });

  protected readonly period = computed(() => this.data()?.period ?? null);
  protected readonly title = computed(() => {
    const p = this.period() ?? this.requested();
    return p ? `Tu mes · ${monthName(p)}` : 'Tu mes';
  });
  protected readonly subtitle = computed(() => {
    const p = this.period();
    return p
      ? p.isCurrent
        ? `${monthLabel(p)} · hasta hoy${p.comparisonThroughDay ? ` · comparación con 1–${p.comparisonThroughDay} ${monthName(shiftMonth(p, -1))}` : ''}`
        : monthLabel(p)
      : '';
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
  /** Hay otro mes para ver: si no, no se muestra la navegación (nada de un "Anterior" suelto). */
  protected readonly canNavigate = computed(() => !!this.prevMonth() || !!this.nextMonth());

  protected readonly empty = computed(() => {
    const d = this.data();
    // Una reseña recibida (aunque sea de un cliente invitado) es algo para mostrar: no es un mes vacío.
    return !!d && !hasActivity(d) && d.recentReviews.length === 0;
  });
  protected readonly advanced = computed(() => this.data()?.advanced ?? null);
  protected readonly exposure = computed(() => this.data()?.exposure ?? null);

  /** Del primer vistazo al trabajo: una fila por paso, todas sobre el mismo eje. */
  protected readonly journey = computed(() => {
    const d = this.data();
    return d ? monthJourney(d) : null;
  });
  protected readonly hasFeatured = computed(() => !!this.exposure()?.featuredImpressions);

  protected readonly nextStep = computed(() => {
    const d = this.data();
    return d ? monthNextStep(d) : null;
  });

  /** Lo que sumó PRO, contado sin atribuirle causas. */
  protected readonly proGains = computed(() => {
    const e = this.exposure();
    const attribution = this.advanced()?.attribution;
    if (!e && !attribution) return null;
    return { e, attribution };
  });

  protected readonly rating = computed(() => {
    const b = this.data()?.basic;
    return b && b.currentRating !== null && b.reviewCount > 0
      ? { value: oneDecimal(b.currentRating), count: reviewsLabel(b.reviewCount) }
      : null;
  });

  /** Comparación contra el mes anterior (solo PRO y solo si hubo actividad para comparar). */
  protected delta(key: keyof MonthCounts): string | null {
    const d = this.data();
    const prev = d?.advanced?.previous ?? null;
    return d && prev ? deltaText(d.basic[key], prev[key], prev) : null;
  }

  protected readonly metricInfo = computed(() =>
    WEEK_METRICS.find((m) => m.key === this.metric())!,
  );
  protected readonly weeks = computed(() => {
    const d = this.data();
    if (!d?.advanced) return null;
    const today = this.isBrowser ? dayNumber(businessDay()) : null;
    return weekChart(d.advanced.weekly, this.metric(), d.period, today);
  });

  private readonly route = inject(ActivatedRoute);
  /** Ya se llevó a la sección del enlace (#resenas): navegar de mes no vuelve a scrollear. */
  private fragmentHandled = false;

  constructor() {
    this.load();
    // El destino del aviso "Recibiste una nueva reseña" (#resenas) está dentro de contenido que llega
    // por HTTP: el scroll nativo del router corre antes de que exista. Se hace cuando ya se dibujó.
    effect(() => {
      const ready = !!this.data() && !this.loading();
      if (!ready || this.fragmentHandled || !this.isBrowser) return;
      const fragment = this.route.snapshot.fragment;
      if (!fragment) return;
      this.fragmentHandled = true;
      setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), 0);
    });
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
