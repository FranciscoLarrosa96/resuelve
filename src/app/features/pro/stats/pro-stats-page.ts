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
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
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
  responseTimeText,
  shiftMonth,
  weekLabel,
} from '../../../core/utils/month-analytics';
import { NO_REVIEWS_TEXT, reviewsLabel } from '../../../core/utils/reputation';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Stars } from '../../../shared/components/stars/stars';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';

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
  imports: [
    AcquisitionMonth,
    TabsDirective,
    NgTemplateOutlet,
    RouterLink,
    BackButton,
    Stars,
    Icon,
    ProBadge,
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
  protected readonly reviewsLabel = reviewsLabel;
  protected readonly plural = pluralize;
  protected readonly count = formatCount;

  protected readonly heroInsight = computed(() => {
    const d = this.data();
    if (!d) return '';
    const a = d.advanced?.acceptance;
    if (a?.sent)
      return a.accepted + ' de tus ' + a.sent + ' presupuestos fueron aceptados este mes.';
    if (d.basic.quotesAccepted)
      return (
        pluralize(d.basic.quotesAccepted, 'presupuesto aceptado', 'presupuestos aceptados') +
        ' este mes.'
      );
    if (d.basic.requestsReceived)
      return (
        pluralize(d.basic.requestsReceived, 'solicitud recibida', 'solicitudes recibidas') +
        ': tu próxima oportunidad empieza con una respuesta.'
      );
    return 'Tu actividad, paso a paso.';
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
  protected readonly monthName = monthName;

  protected readonly empty = computed(() => {
    const d = this.data();
    // Una reseña recibida (aunque sea de un cliente invitado) es algo para mostrar: no es un mes vacío.
    return !!d && !hasActivity(d) && d.recentReviews.length === 0;
  });
  protected readonly advanced = computed(() => this.data()?.advanced ?? null);

  /** Franja del resumen (Free y PRO). La comparación solo llega con análisis detallado. */
  protected readonly summary = computed(() => {
    const d = this.data();
    if (!d) return [];
    const rows: { key: keyof MonthCounts; label: string; icon: IconName }[] = [
      { key: 'requestsReceived', label: 'Solicitudes recibidas', icon: 'inbox' },
      { key: 'quotesSent', label: 'Presupuestos enviados', icon: 'send' },
      { key: 'quotesAccepted', label: 'Presupuestos aceptados', icon: 'check-circle' },
      { key: 'reviewsReceived', label: 'Opiniones del mes', icon: 'message' },
    ];
    return rows.map((r) => ({ ...r, value: d.basic[r.key], delta: this.delta(r.key) }));
  });

  /** Free: recorrido del mes solo con conteos básicos (sin exposición, que es PRO). */
  protected readonly basicFunnel = computed(() => {
    const b = this.data()?.basic;
    if (!b) return [];
    const steps: [string, number][] = [
      ['Solicitudes recibidas', b.requestsReceived],
      ['Presupuestos enviados', b.quotesSent],
      ['Presupuestos aceptados', b.quotesAccepted],
      ['Trabajos realizados', b.completedJobs],
    ];
    const max = Math.max(1, ...steps.map(([, v]) => v));
    return steps.map(([label, value]) => ({ label, value, pct: (value / max) * 100 }));
  });
  /** PRO: apariciones, visitas y embudo reales (null en Free). */
  protected readonly exposure = computed(() => this.data()?.exposure ?? null);
  /**
   * Después de las apariciones (el número grande): visitas → solicitudes →
   * presupuestos → aceptados → realizados, con barras relativas al mayor de
   * estos pasos y la tasa real del backend donde tiene base.
   */
  protected readonly max = Math.max;
  protected readonly journey = computed(() => {
    const d = this.data();
    if (!d?.exposure) return [];
    const steps = monthFunnel(d.exposure, d.basic);
    const max = Math.max(1, ...steps.map((s) => s.value));
    const { rates } = d.exposure;
    const notes: (string | null)[] = [
      null,
      rates.viewsPerImpression !== null
        ? `${rateText(rates.viewsPerImpression)} de las apariciones`
        : null,
      rates.requestsPerView !== null ? `${rateText(rates.requestsPerView)} de las visitas` : null,
      null,
      rates.acceptance !== null ? `${rateText(rates.acceptance)} de tus presupuestos` : null,
      null,
    ];
    const icons: IconName[] = ['search', 'eye', 'inbox', 'send', 'check-circle', 'briefcase'];
    const deltas = [
      this.exposureDelta('impressions'),
      this.exposureDelta('profileViews'),
      this.delta('requestsReceived'),
      this.delta('quotesSent'),
      this.delta('quotesAccepted'),
      this.delta('completedJobs'),
    ];
    return steps.map((s, i) => ({
      ...s,
      pct: (s.value / max) * 100,
      note: notes[i] ?? '',
      icon: icons[i],
      delta: deltas[i],
    }));
  });
  /** Servicios con barra relativa al que más solicitudes trajo. */
  protected readonly services = computed(() => {
    const rows = this.data()?.advanced?.byService ?? [];
    const max = Math.max(1, ...rows.map((r) => r.requestsReceived));
    return rows.map((r) => ({ ...r, pct: (r.requestsReceived / max) * 100 }));
  });

  /** Apariciones / visitas contra el mes anterior (solo si ese mes tuvo registros). */
  protected exposureDelta(key: 'impressions' | 'profileViews'): string | null {
    const d = this.data();
    const prev = d?.exposure?.previous;
    return d?.exposure && prev
      ? deltaText(d.exposure[key], prev[key], shiftMonth(d.period, -1))
      : null;
  }

  protected readonly rating = computed(() => {
    const b = this.data()?.basic;
    return b && b.currentRating !== null && b.reviewCount > 0
      ? { value: oneDecimal(b.currentRating), count: reviewsLabel(b.reviewCount) }
      : null;
  });
  protected readonly insights = computed(() => {
    const d = this.data();
    return d?.advanced ? monthInsights(d.advanced, d.basic, d.period, d.exposure) : [];
  });

  /** Comparación contra el mes anterior (solo PRO y solo si hubo actividad para comparar). */
  protected delta(key: keyof MonthCounts): string | null {
    const d = this.data();
    const prev = d?.advanced?.previous ?? null;
    return d && prev ? deltaText(d.basic[key], prev[key], prev) : null;
  }

  protected readonly metricLabel = computed(
    () => WEEK_METRICS.find((m) => m.key === this.metric())!.label,
  );
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
