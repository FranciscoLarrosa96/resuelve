import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { URGENT_CATEGORIES } from '../../../core/data/catalog.data';
import { CategoryName } from '../../../core/models/category';
import { Professional } from '../../../core/models/professional';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { ToastService } from '../../../core/services/toast.service';
import { RequestStore } from '../../../core/state/request.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';

@Component({
  selector: 'app-urgent-page',
  imports: [Avatar, BackButton, Icon, ChipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './urgent-page.html',
})
export class UrgentPage {
  private readonly router = inject(Router);
  private readonly pros = inject(ProfessionalsService);
  private readonly toast = inject(ToastService);
  private readonly request = inject(RequestStore);

  protected readonly categories = URGENT_CATEGORIES;
  protected readonly category = signal<CategoryName>(
    URGENT_CATEGORIES.includes(this.request.draft().category) ? this.request.draft().category : 'Plomería',
  );
  /** Profesional al que se le mandó el aviso prioritario. */
  protected readonly sentId = signal<string | null>(null);
  protected readonly f1 = oneDecimal;

  protected readonly list = computed(() => this.pros.availableNow(this.category()));
  protected readonly countText = computed(() =>
    pluralize(this.list().length, 'profesional disponible ahora', 'profesionales disponibles ahora'),
  );

  protected pick(category: CategoryName): void {
    this.category.set(category);
    this.sentId.set(null);
  }

  protected help(pro: Professional): void {
    this.sentId.set(pro.id);
    this.toast.show(`Le avisamos a ${pro.firstName}. Te llama en minutos.`);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }
}
