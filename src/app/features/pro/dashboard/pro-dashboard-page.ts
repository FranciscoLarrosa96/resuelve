import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AGENDA_WEEK, PRO_STATS, RECENT_ACTIVITY, WEEK_INCOME } from '../../../core/data/pro.data';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS } from '../../../core/utils/format';
import { AvailabilitySwitch } from '../../../shared/components/availability-switch/availability-switch';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { eventsOfDay, longToday, requestMeta, urgencyTone } from '../pro-ui';

@Component({
  selector: 'app-pro-dashboard-page',
  imports: [RouterLink, AvailabilitySwitch, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-dashboard-page.html',
})
export class ProDashboardPage {
  protected readonly store = inject(ProStore);

  protected readonly today = longToday();
  protected readonly firstName = computed(() => this.store.settings().name.split(' ')[0]);
  protected readonly stats = PRO_STATS;
  protected readonly activity = RECENT_ACTIVITY;
  protected readonly ars = formatARS;
  protected readonly tone = urgencyTone;
  protected readonly meta = requestMeta;

  protected readonly todayEvents = eventsOfDay(AGENDA_WEEK.todayIndex);
  protected readonly nextEvent = this.todayEvents.find((e) => !e.past);
  protected readonly tomorrow = eventsOfDay(AGENDA_WEEK.todayIndex + 1);
  protected readonly dashRequests = computed(() => this.store.newRequests().slice(0, 4));

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
