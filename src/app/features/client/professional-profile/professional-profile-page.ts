import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { ToastService } from '../../../core/services/toast.service';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { CheckBadge } from '../../../shared/components/check-badge/check-badge';
import { Icon } from '../../../shared/components/icon/icon';

@Component({
  selector: 'app-professional-profile-page',
  imports: [RouterLink, Avatar, BackButton, CheckBadge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './professional-profile-page.html',
})
export class ProfessionalProfilePage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsService);
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly pro = computed(() => this.pros.byId(this.id()));
  protected readonly detail = computed(() => {
    const pro = this.pro();
    return pro ? this.pros.detail(pro) : null;
  });
  protected readonly inComparison = computed(() => this.search.selectedIds().includes(this.id()));
  protected readonly f1 = oneDecimal;

  protected back(): void {
    this.backNav.back('/profesionales');
  }

  protected ask(): void {
    this.request.askProfessionals([this.id()]);
    this.router.navigate(['/presupuesto']);
  }

  protected editRequest(): void {
    this.request.goToStep(5);
    this.router.navigate(['/solicitud']);
  }

  protected async share(): Promise<void> {
    const pro = this.pro();
    if (!pro || typeof navigator === 'undefined') return;
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${pro.name} en Resuelve`, url });
      } else {
        await navigator.clipboard.writeText(url);
        this.toast.show('Copiamos el enlace del perfil');
      }
    } catch {
      /* el usuario canceló */
    }
  }
}
