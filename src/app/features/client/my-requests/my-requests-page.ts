import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STAGES } from '../../../core/data/client-requests.data';
import { ClientRequest } from '../../../core/models/service-request';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { AuthStore } from '../../../core/state/auth.store';
import { ClientRequestsStore } from '../../../core/state/client-requests.store';
import { formatARS, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { RequestDetail } from './request-detail/request-detail';

@Component({
  selector: 'app-my-requests-page',
  imports: [RouterLink, Avatar, Icon, RequestDetail, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-requests-page.html',
})
export class MyRequestsPage {
  private readonly pros = inject(ProfessionalsService);
  protected readonly store = inject(ClientRequestsStore);
  /** Datos mock, pero personales: solo con sesión (authGuard + este chequeo para el HTML prerenderizado). */
  protected readonly auth = inject(AuthStore);

  protected readonly stages = STAGES;
  protected readonly ars = formatARS;
  protected readonly stars = [1, 2, 3, 4, 5];

  /** Mobile: tarjeta expandida. */
  protected readonly expandedId = signal<string | null>(null);

  protected stage(r: ClientRequest) {
    return STAGES[r.stage];
  }

  protected summary(r: ClientRequest): string {
    const chosen = this.pros.byId(r.chosenId);
    switch (r.stage) {
      case 0:
        return `Enviada a ${r.professionalIds.length} profesionales`;
      case 1: {
        const amounts = (r.quotes ?? []).map((q) => q.amount);
        if (!amounts.length) return 'Todavía sin presupuestos';
        const count = pluralize(amounts.length, 'presupuesto', 'presupuestos');
        return amounts.length === 1 ? `${count} · ${formatARS(amounts[0])}` : `${count} · desde ${formatARS(Math.min(...amounts))}`;
      }
      case 2:
        return `Con ${chosen?.name} · ${formatARS(r.amount ?? 0)}`;
      case 5:
        return `Con ${chosen?.name} · ★ ${r.myRating ?? 5}`;
      default:
        return `Con ${chosen?.name} · ${r.when}`;
    }
  }

  protected quoteRows(r: ClientRequest) {
    return (r.quotes ?? []).map((q) => ({ ...q, pro: this.pros.get(q.professionalId) }));
  }

  protected toggle(r: ClientRequest): void {
    if (this.expandedId() === r.id) {
      this.expandedId.set(null);
      return;
    }
    this.store.select(r.id);
    this.expandedId.set(r.id);
  }

  /** Mobile: tocar una estrella en la tarjeta abre la reseña con ese puntaje. */
  protected quickRate(r: ClientRequest, value: number): void {
    this.store.select(r.id);
    this.store.rating.set(value);
    this.expandedId.set(r.id);
  }
}
