import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { RequestUrgency } from '../../../core/models/request';
import { JobsStore } from '../../../core/state/jobs.store';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { normalizeCalendarDay } from '../../../core/utils/dates';
import { businessDay, dayNumber, shiftDay, shortWeekday } from '../../../core/utils/business-time';
import { formatCount, formatMoney, oneDecimal } from '../../../core/utils/format';
import { monthName, responseTimeText } from '../../../core/utils/month-analytics';
import { hasReviews, noReviewsText, reviewsLabel } from '../../../core/utils/reputation';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { PushSuggestion } from '../../../shared/components/push-suggestion/push-suggestion';
import { ReferralsPanel } from '../../../shared/components/acquisition/referrals-panel';
import { ReviewInvite } from '../../../shared/components/review-invite/review-invite';
import { Icon } from '../../../shared/components/icon/icon';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';
import { Tag, TagTone } from '../../../shared/components/tag/tag';
import { clientName, longToday, proRequestActions, urgencyLabel, whenText } from '../pro-ui';

/** "Hoy", "Mañana" o "Lun 28". */
function shortDay(day: string, today: string): string {
  if (day === today) return 'Hoy';
  if (day === shiftDay(today, 1)) return 'Mañana';
  return `${shortWeekday(day)} ${dayNumber(day)}`;
}

/**
 * Inicio del panel profesional, en orden de urgencia: "Lo próximo" (lo único
 * que hay que hacer ahora), la cola de solicitudes, cómo te va en el mes y, al
 * final y en tono secundario, lo que podés hacer para crecer. Solo datos REALES (solicitudes, agenda, /pro/me y Tu mes). La
 * ruta exige sesión y perfil profesional, así que nunca hay versión demo.
 * Lo que no llega se muestra cargando, vacío o con error; nunca inventado.
 */
@Component({
  selector: 'app-pro-dashboard-page',
  imports: [RouterLink, AvailabilitySwitch, Icon, ProBadge, Tag, ReferralsPanel, ReviewInvite, PushSuggestion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-dashboard-page.html',
})
export class ProDashboardPage {
  protected readonly store = inject(ProStore);
  protected readonly reqs = inject(ProRequestsStore);
  protected readonly jobs = inject(JobsStore);
  private readonly notifications = inject(NotificationsStore);
  protected readonly unread = this.notifications.proUnread;
  protected openNotifications(): void {
    this.notifications.requestCenter('PROFESSIONAL');
  }
  private readonly analyticsApi = inject(ProAnalyticsApiService);

  protected readonly today = longToday();
  protected readonly greeting = computed(() => (this.store.firstName() ? `Buen día, ${this.store.firstName()}` : 'Buen día'));
  /** Valoración REAL (GET /pro/me): sin reseñas no hay número. */
  protected readonly rating = computed(() => {
    const p = this.store.ownProfile();
    return p && hasReviews(p) ? { average: oneDecimal(p.averageRating!), count: reviewsLabel(p.reviewsCount) } : null;
  });
  protected readonly noReviews = computed(() => noReviewsText(this.store.ownProfile() ?? {}));
  protected readonly urgency = urgencyLabel;
  protected readonly client = clientName;
  protected readonly when = whenText;
  protected readonly actions = proRequestActions;
  protected readonly count = formatCount;
  protected readonly money = formatMoney;

  protected readonly dashRequests = computed(() =>
    this.reqs.tab() === 'PENDING' ? this.reqs.items().filter((r) => r.opportunity?.actionable).slice(0, 4) : [],
  );

  /** Agenda de la semana en curso: trabajos de hoy y los próximos (sin realizados ni pasados). */
  private readonly jobsReady = computed(() => this.jobs.loaded());
  protected readonly todayJobs = computed(() => {
    const day = businessDay();
    return this.jobsReady()
      ? this.jobs.items().filter((job) => normalizeCalendarDay(job.scheduledDate) === day && ['SCHEDULED', 'IN_PROGRESS'].includes(job.status)).length
      : null;
  });
  /** Trabajos con horario terminado sin cerrar (se deriva por fecha en el backend). */
  protected readonly toCoordinateCount = computed(() => this.jobsReady() ? this.jobs.counts().toCoordinate : null);
  protected readonly upcoming = computed(() => {
    if (!this.jobsReady()) return null;
    const today = businessDay();
    return this.jobs
      .items()
      .filter((i) => normalizeCalendarDay(i.scheduledDate) && normalizeCalendarDay(i.scheduledDate)! >= today && ['SCHEDULED', 'IN_PROGRESS'].includes(i.status))
      .slice(0, 4)
      .map((i) => ({
        ...i,
        heading: shortDay(normalizeCalendarDay(i.scheduledDate)!, today),
        time: i.scheduledTime ?? 'Hora pendiente',
        client: `${i.client.firstName} ${i.client.lastInitial}.`,
      }));
  });

  /** Cupo Free total; PRO no lo muestra (es su plan, no una métrica del día). */
  protected readonly quotes = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    if (!u) return null;
    return { used: u.used, limit: u.limit, remaining: u.remaining };
  });

  // ---- Lo próximo: una sola tarjeta protagonista ------------------------------
  /** Prioridad: solicitud para responder → trabajos pendientes de cierre → próximo trabajo. */
  protected readonly nextRequest = computed(() => this.dashRequests()[0] ?? null);
  protected readonly otherRequests = computed(() => this.dashRequests().slice(1));
  protected readonly nextUp = computed<'REQUEST' | 'CLOSE' | 'JOB' | 'NONE' | null>(() => {
    if (!this.reqs.loaded() && !this.reqs.error()) return null;
    if (this.nextRequest()) return 'REQUEST';
    if (!this.jobsReady()) return this.jobs.error() ? 'NONE' : null;
    if (this.toCoordinateCount()) return 'CLOSE';
    return this.upcoming()?.length ? 'JOB' : 'NONE';
  });
  protected readonly nextJob = computed(() => (this.nextUp() === 'JOB' ? this.upcoming()![0] : null));
  /** Próximos trabajos sin repetir el que ya está en "Lo próximo". */
  protected readonly laterJobs = computed(() => {
    const list = this.upcoming();
    if (!list) return null;
    return (this.nextJob() ? list.slice(1) : list).slice(0, 3);
  });
  /** Estado del día: solo lo que tiene número; si todo está en 0, una frase ("Al día"). */
  protected readonly dayChips = computed(() => {
    const requests = this.reqs.actionableCount();
    const today = this.todayJobs();
    const close = this.toCoordinateCount();
    if (requests === null || today === null || close === null) return null;
    const chips: { label: string; link: string; accent: boolean }[] = [];
    if (requests) chips.push({ label: requests === 1 ? '1 solicitud nueva' : `${requests} solicitudes nuevas`, link: '/pro/solicitudes', accent: true });
    if (today) chips.push({ label: today === 1 ? '1 trabajo hoy' : `${today} trabajos hoy`, link: '/pro/agenda', accent: false });
    if (close) chips.push({ label: close === 1 ? '1 pendiente de cierre' : `${close} pendientes de cierre`, link: '/pro/agenda', accent: true });
    return chips;
  });

  // ---- Tu mes (GET /pro/analytics/month) ------------------------------------
  protected readonly month = signal<MonthAnalytics | null>(null);
  protected readonly responseTimeText = responseTimeText;
  protected readonly monthError = signal(false);
  protected readonly monthTitle = computed(() => {
    const m = this.month()?.period;
    return m ? `Tu mes · ${monthName(m)}` : 'Tu mes';
  });
  /** PRO: presencia + resultados como un solo embudo, todas las barras a la misma escala. */
  protected readonly funnel = computed(() => {
    const m = this.month();
    if (!m?.exposure) return null;
    const steps = [
      { label: 'Apariciones', value: m.exposure.impressions },
      { label: 'Visitas al perfil', value: m.exposure.profileViews },
      { label: 'Solicitudes', value: m.basic.requestsReceived },
      { label: 'Presupuestos', value: m.basic.quotesSent },
      { label: 'Aceptados', value: m.basic.quotesAccepted },
      { label: 'Realizados', value: m.basic.completedJobs },
    ];
    const max = Math.max(1, ...steps.map((s) => s.value));
    return steps.map((s) => ({ ...s, pct: (s.value / max) * 100 }));
  });

  constructor() {
    effect(() => {
      if (!this.reqs.hasProfile()) return;
      untracked(() => {
        if (this.reqs.tab() === 'PENDING') this.reqs.load(true, 50);
        else this.reqs.setTab('PENDING');
        this.jobs.load();
      });
    });
    this.store.refreshProfile();
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const sub = this.analyticsApi.getMonth().subscribe({
        next: (m) => this.month.set(m),
        error: () => this.monthError.set(true),
      });
      inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    }
  }

  protected urgencyTag(u: RequestUrgency): TagTone {
    return u === 'URGENT' ? 'accent' : u === 'TODAY' ? 'brand' : 'neutral';
  }
}
