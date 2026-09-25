import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DISCOVERY_SOURCES, FUNNEL, PRO_STATS, WEEK_INCOME } from '../../../core/data/pro.data';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';

@Component({
  selector: 'app-pro-stats-page',
  imports: [RouterLink, BackButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-stats-page.html',
})
export class ProStatsPage {
  private readonly backNav = inject(BackNavigation);
  protected readonly store = inject(ProStore);

  protected readonly stats = PRO_STATS;
  protected readonly funnel = FUNNEL;
  protected readonly sources = DISCOVERY_SOURCES;
  protected readonly ars = formatARS;

  private readonly max = Math.max(...WEEK_INCOME.map((w) => Math.max(w.amount, w.previousAmount)));
  protected readonly bars = WEEK_INCOME.map((w, i) => ({
    label: w.label,
    value: Math.round(w.amount / 1000) + 'k',
    pct: (w.amount / this.max) * 100,
    prevPct: (w.previousAmount / this.max) * 100,
    current: i === WEEK_INCOME.length - 1,
  }));

  protected back(): void {
    this.backNav.back('/pro/dashboard');
  }
}
