import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../../core/models/professional';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ProBadge } from '../../../../shared/components/plan-badges/plan-badges';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';

import { ProfessionalActions } from './professional-actions';
import { FeaturedProfessionalSpotlight } from './featured-professional-spotlight';
import { professionalSubtitle, trustSignals } from './professional-presentation';
import { noReviewsText } from '../../../../core/utils/reputation';
export { professionalSubtitle, trustSignals } from './professional-presentation';

/**
 * Resultado responsive: identidad | señales |
 * acciones. Se lee de izquierda a derecha: quién es, qué hace, si inspira
 * confianza, si está disponible y dónde trabaja. Solo datos reales.
 */
@Component({
  selector: 'app-result-card, app-result-card-mobile',
  imports: [
    RouterLink,
    Avatar,
    Icon,
    VerifiedSeal,
    ProBadge,
    ProfessionalActions,
    FeaturedProfessionalSpotlight,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'professional-result',
    '[class.featured]': '!!pro().isFeaturedPlacement',
    '[class.pro-account]': 'pro().pro',
    '[class.selected]': 'selected()',
  },
  styleUrl: './result-card.css',
  templateUrl: './result-card.html',
})
export class ResultCard {
  protected readonly search = inject(SearchStore);
  private readonly pros = inject(ProfessionalsStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly ask = output<ProfessionalSummary>();
  readonly comparison = input(true);

  protected readonly avatar = computed(() => avatarOf(this.pro()));
  protected readonly selected = computed(
    () => this.comparison() && this.search.selectedIds().includes(this.pro().id),
  );
  protected readonly subtitle = computed(() => professionalSubtitle(this.pro()));
  protected readonly zones = computed(() => coverageText(this.pro()));
  protected readonly trust = computed(() =>
    trustSignals(this.pro(), this.search.licenseApplicable(), this.pros.filters().serviceId),
  );
  protected readonly f1 = oneDecimal;
  protected readonly noReviews = noReviewsText;
}
