import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  RATING_LABELS,
  REVIEW_TAGS,
  STAGE_STEP_LABELS,
} from '../../../../core/data/client-requests.data';
import { ClientRequest } from '../../../../core/models/service-request';
import { ProfessionalsService } from '../../../../core/services/professionals.service';
import { ClientRequestsStore } from '../../../../core/state/client-requests.store';
import { RequestStore } from '../../../../core/state/request.store';
import { formatARS, oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ChipDirective } from '../../../../shared/directives/chip.directive';

/**
 * Avance y acción pendiente de una solicitud del cliente.
 * Se usa en el panel lateral (desktop) y en la tarjeta expandida (mobile).
 */
@Component({
  selector: 'app-request-detail',
  imports: [RouterLink, Avatar, Icon, ChipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.html',
})
export class RequestDetail {
  private readonly router = inject(Router);
  private readonly pros = inject(ProfessionalsService);
  private readonly request = inject(RequestStore);
  protected readonly store = inject(ClientRequestsStore);

  readonly item = input.required<ClientRequest>();
  /** Versión compacta para mobile (stepper sin etiquetas, fotos → iniciales). */
  readonly compact = input(false);

  protected readonly stepLabels = STAGE_STEP_LABELS;
  protected readonly reviewTags = REVIEW_TAGS;
  protected readonly stars = [1, 2, 3, 4, 5];
  protected readonly ars = formatARS;
  protected readonly f1 = oneDecimal;

  protected readonly progress = computed(() => Math.min(this.item().stage, 4));
  protected readonly chosen = computed(() => this.pros.byId(this.item().chosenId));
  protected readonly waiting = computed(() => this.pros.many(this.item().professionalIds));
  protected readonly quotes = computed(() => {
    const quotes = this.item().quotes ?? [];
    const min = Math.min(...quotes.map((q) => q.amount));
    return quotes.map((q) => ({
      ...q,
      pro: this.pros.get(q.professionalId),
      cheapest: quotes.length > 1 && q.amount === min,
    }));
  });
  protected readonly ratingLabel = computed(() => RATING_LABELS[this.store.rating()]);

  protected onReviewText(event: Event): void {
    this.store.reviewText.set((event.target as HTMLTextAreaElement).value);
  }

  protected rehire(): void {
    const chosen = this.item().chosenId;
    if (!chosen) return;
    this.request.askProfessionals([chosen]);
    this.router.navigate(['/presupuesto']);
  }
}
