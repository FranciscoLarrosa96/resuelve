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
import { monthInsights, monthName, responseTimeText } from '../../../core/utils/month-analytics';
import { NO_REVIEWS_TEXT, hasReviews, reviewsLabel } from '../../../core/utils/reputation';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
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
 * Inicio del panel profesional: qué hay que hacer hoy, qué está por venir y
 * cómo te va. Solo datos REALES (solicitudes, agenda, /pro/me y Tu mes). La
 * ruta exige sesión y perfil profesional, así que nunca hay versión demo.
 * Lo que no llega se muestra cargando, vacío o con error; nunca inventado.
 */
@Component({
  selector: 'app-pro-dashboard-page',
  imports: [RouterLink, AvailabilitySwitch, Icon, ProBadge, Tag, ReferralsPanel, ReviewInvite],
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
  /** Trabajos con horario terminado sin cerrar (se deriva por fecha en el backend). */
  private readonly analyticsApi = inject(ProAnalyticsApiService);

  protected readonly today = longToday();
  protected readonly greeting = computed(() => (this.store.firstName() ? `Buen día, ${this.store.firstName()}` : 'Buen día'));
  /** Valoración REAL (GET /pro/me): sin reseñas no hay número. */
  protected readonly rating = computed(() => {
    const p = this.store.ownProfile();
    return p && hasReviews(p) ? { average: oneDecimal(p.averageRating!), count: reviewsLabel(p.reviewsCount) } : null;
  });
  protected readonly noReviews = NO_REVIEWS_TEXT;
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
  protected readonly toCoordinateCount = computed(() => this.jobsReady() ? this.jobs.counts().toCoordinate : null);
  protected readonly upcoming = computed(() => {
    if (!this.jobsReady()) return null;
    const today = businessDay();
    return this.jobs
      .items()
      .filter((i) => normalizeCalendarDay(i.scheduledDate) && normalizeCalendarDay(i.scheduledDate)! >= today && ['SCHEDULED', 'IN_PROGRESS'].includes(i.status))
      .slice(0, 3)
      .map((i) => ({
        ...i,
        heading: shortDay(normalizeCalendarDay(i.scheduledDate)!, today),
        time: i.scheduledTime ?? 'Hora pendiente',
        client: `${i.client.firstName} ${i.client.lastInitial}.`,
      }));
  });

  /** Cupo Free total; PRO se presenta como respuestas sin límite. */
  protected readonly quotes = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    if (!u) return null;
    return { used: u.used, limit: u.limit, remaining: u.remaining };
  });
  protected readonly qLabel = computed(() => {
    const q = this.quotes();
    return q && q.limit !== null ? 'Oportunidades Free' : 'Respuestas';
  });

  // ---- Tu mes (GET /pro/analytics/month) ------------------------------------
  protected readonly month = signal<MonthAnalytics | null>(null);
  protected readonly responseTimeText = responseTimeText;
  protected readonly monthError = signal(false);
  protected readonly monthTitle = computed(() => {
    const m = this.month()?.period;
    return m ? `Tu mes · ${monthName(m)}` : 'Tu mes';
  });
  protected readonly topInsights = computed(() => {
    const month = this.month();
    return month?.advanced ? monthInsights(month.advanced, month.basic, month.period, month.exposure).slice(0, 3) : [];
  });
  /** Actividad por semana (solo con análisis detallado): barras relativas al máximo. */
  protected readonly weekly = computed(() => {
    const weeks = this.month()?.advanced?.weekly ?? [];
    const max = Math.max(1, ...weeks.map((w) => w.requestsReceived));
    return weeks.map((w) => ({ ...w, pct: Math.round((w.requestsReceived / max) * 100) }));
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
