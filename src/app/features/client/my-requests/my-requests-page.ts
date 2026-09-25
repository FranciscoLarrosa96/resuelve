import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RequestStatus, ServiceRequest } from '../../../core/models/request';
import { REQUEST_STATUS_FILTERS, requestStatusLabel } from '../../../core/models/request-status';
import { AuthStore } from '../../../core/state/auth.store';
import { MyRequestsStore } from '../../../core/state/my-requests.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { pluralize } from '../../../core/utils/format';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';

/** "Mis solicitudes": solicitudes REALES del usuario (GET /requests/mine). */
@Component({
  selector: 'app-my-requests-page',
  imports: [RouterLink, Icon, SessionPending, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-requests-page.html',
})
export class MyRequestsPage {
  protected readonly store = inject(MyRequestsStore);
  /** Datos personales: solo con sesión (authGuard + este chequeo para el HTML prerenderizado). */
  protected readonly auth = inject(AuthStore);

  protected readonly filters = REQUEST_STATUS_FILTERS.map((status) => ({ status, label: requestStatusLabel(status) }));
  protected readonly date = formatTimestamp;

  constructor() {
    effect(() => {
      if (this.auth.authenticated()) untracked(() => this.store.load(true));
    });
    onTabVisible(() => this.store.load(true));
  }

  protected setFilter(status: RequestStatus | null): void {
    this.store.setFilter(status);
  }

  /** Resumen en una línea, solo con datos reales de la solicitud. */
  protected summary(r: ServiceRequest): string {
    if (r.status === 'DRAFT') return 'Sin profesionales invitados';
    const selected = r.invitations.find((i) => i.professionalId === r.selectedProfessionalId)?.professional;
    if (selected) return `Con ${selected.displayName}`;
    const invited = pluralize(r.invitations.length, 'profesional', 'profesionales');
    return `Enviada a ${invited}`;
  }

  protected needsAction(r: ServiceRequest): boolean {
    return r.status === 'QUOTES_RECEIVED';
  }
}
