import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AGENDA_WEEK, PRO_STATS, RECENT_ACTIVITY, WEEK_INCOME } from '../../../core/data/pro.data';
import { ProRequestsApiService } from '../../../core/api/pro-requests-api.service';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS } from '../../../core/utils/format';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { eventsOfDay, longToday, proRequestActions, requestMeta, urgencyLabel, urgencyTone } from '../pro-ui';

@Component({
  selector: 'app-pro-dashboard-page',
  imports: [RouterLink, AvailabilitySwitch, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-dashboard-page.html',
})
export class ProDashboardPage {
  protected readonly store = inject(ProStore);
  /** Solicitudes REALES (el resto del dashboard sigue siendo demo). */
  protected readonly reqs = inject(ProRequestsStore);
  private readonly reqsApi = inject(ProRequestsApiService);
  protected readonly quotedCount = signal<number | null>(null);

  protected readonly today = longToday();
  protected readonly greeting = computed(() => (this.store.firstName() ? `Buen día, ${this.store.firstName()}` : 'Buen día'));
  protected readonly stats = PRO_STATS;
  protected readonly activity = RECENT_ACTIVITY;
  protected readonly ars = formatARS;
  protected readonly tone = urgencyTone;
  protected readonly urgency = urgencyLabel;
  protected readonly actions = proRequestActions;
  protected readonly meta = requestMeta;

  protected readonly todayEvents = eventsOfDay(AGENDA_WEEK.todayIndex);
  protected readonly nextEvent = this.todayEvents.find((e) => !e.past);
  protected readonly tomorrow = eventsOfDay(AGENDA_WEEK.todayIndex + 1);
  protected readonly dashRequests = computed(() =>
    this.reqs.tab() === 'PENDING' ? this.reqs.items().slice(0, 4) : [],
  );

  constructor() {
    effect(() => {
      if (!this.reqs.hasProfile()) return;
      untracked(() => {
        if (this.reqs.tab() === 'PENDING') this.reqs.load(true);
        else this.reqs.setTab('PENDING');
        // Solo el total (pageSize 1): lo filtra el backend.
        this.reqsApi.getRequests({ status: 'QUOTED', pageSize: 1 }).subscribe({
          next: (res) => this.quotedCount.set(res.total),
          error: () => undefined,
        });
      });
    });
  }

  protected readonly weekBars = (() => {
    const max = Math.max(...WEEK_INCOME.map((w) => w.amount));
    return WEEK_INCOME.map((w, i) => ({
      label: w.label,
      value: Math.round(w.amount / 1000) + 'k',
      /** % de la altura disponible */
      pct: (w.amount / max) * 100,
      current: i === WEEK_INCOME.length - 1,
    }));
  })();
}
