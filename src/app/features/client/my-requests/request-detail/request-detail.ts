import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  RATING_LABELS,
  REVIEW_TAGS,
  STAGE_STEP_LABELS,
} from '../../../../core/data/client-requests.data';
import { avatarOf } from '../../../../core/models/avatar';
import { ClientRequest, RequestProfessional } from '../../../../core/models/service-request';
import { ClientRequestsStore, requestProfessional } from '../../../../core/state/client-requests.store';
import { RequestStore } from '../../../../core/state/request.store';
import { SearchStore } from '../../../../core/state/search.store';
import { formatARS, oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { ChipDirective } from '../../../../shared/directives/chip.directive';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unknownPro = (id: string): RequestProfessional => ({
  id, displayName: 'Profesional', firstName: 'Profesional', avatarUrl: null, averageRating: null, reviewsCount: 0,
});

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
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
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
  protected readonly chosen = computed(() => this.view(requestProfessional(this.item(), this.item().chosenId)));
  protected readonly waiting = computed(() => this.item().professionals.map((p) => this.view(p)!));
  protected readonly quotes = computed(() => {
    const quotes = this.item().quotes ?? [];
    const min = Math.min(...quotes.map((q) => q.amount));
    return quotes.map((q) => ({
      ...q,
      pro: this.view(requestProfessional(this.item(), q.professionalId)) ?? this.view(unknownPro(q.professionalId))!,
      cheapest: quotes.length > 1 && q.amount === min,
    }));
  });
  protected readonly ratingLabel = computed(() => RATING_LABELS[this.store.rating()]);

  /** Datos para la vista. Solo los profesionales reales (UUID) tienen perfil público. */
  private view(p: RequestProfessional | undefined) {
    if (!p) return undefined;
    return { ...p, name: p.displayName, avatar: avatarOf(p), hasProfile: UUID.test(p.id) };
  }

  protected onReviewText(event: Event): void {
    this.store.reviewText.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Nunca reenvía la solicitud anterior: arma un borrador nuevo con sus datos
   * básicos y lleva a "Revisá tu pedido" para editarlo antes de enviar.
   */
  protected createSimilar(): void {
    this.search.resetForNewRequest();
    this.request.repeatFrom(this.item());
    this.router.navigate(['/solicitud']);
  }
}
