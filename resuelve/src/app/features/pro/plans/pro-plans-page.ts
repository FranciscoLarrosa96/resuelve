import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FREE_FEATURES, PLAN_PRICE, PLAN_ROWS, PRO_FEATURES } from '../../../core/data/pro.data';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';

@Component({
  selector: 'app-pro-plans-page',
  imports: [BackButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
})
export class ProPlansPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  protected readonly store = inject(ProStore);

  protected readonly price = formatARS(PLAN_PRICE);
  protected readonly rows = PLAN_ROWS;
  protected readonly freeFeatures = FREE_FEATURES;
  protected readonly proFeatures = PRO_FEATURES;

  protected startPro(): void {
    this.store.startProTrial();
    this.router.navigate(['/pro/estadisticas']);
  }

  protected back(): void {
    this.backNav.back('/pro/perfil');
  }
}
