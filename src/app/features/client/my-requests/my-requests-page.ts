import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { requestNews } from '../../../core/models/notification';
import { RequestGroup, ServiceRequest } from '../../../core/models/request';
import { REQUEST_GROUP_FILTERS, RequestStage, clientStage } from '../../../core/models/request-status';
import { AuthStore } from '../../../core/state/auth.store';
import { MyRequestsStore } from '../../../core/state/my-requests.store';
import { NotificationsStore } from '../../../core/state/notifications.store';
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
  protected readonly notifications = inject(NotificationsStore);
  /** Datos personales: solo con sesión (authGuard + este chequeo para el HTML prerenderizado). */
  protected readonly auth = inject(AuthStore);

  protected readonly filters = REQUEST_GROUP_FILTERS;
  protected readonly date = formatTimestamp;
  /** Hora de referencia para "Pendiente de confirmar" (se actualiza sola). */
  private readonly now = signal(Date.now());

  constructor() {
    effect(() => {
      if (this.auth.authenticated()) untracked(() => this.store.load(true));
    });
    // Llegó algo nuevo mientras la lista está abierta: se relee sin F5.
    let arrivals = this.notifications.arrivals();
    effect(() => {
      const next = this.notifications.arrivals();
      if (next !== arrivals) untracked(() => this.store.load(true));
      arrivals = next;
    });
    onTabVisible(() => {
      this.now.set(Date.now());
      this.store.load(true);
    });
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected setFilter(group: RequestGroup | null): void {
    this.store.setFilter(group);
  }

  protected stage(r: ServiceRequest): RequestStage {
    return clientStage(r, this.now());
  }

  /** Novedad más relevante sin leer ("Nuevo presupuesto", "2 presupuestos nuevos"). */
  protected news(r: ServiceRequest): string | null {
    return requestNews(this.notifications.clientByRequest().get(r.id) ?? []);
  }

  /** Resumen en una línea, solo con datos reales de la solicitud. */
  protected summary(r: ServiceRequest): string {
    if (r.status === 'DRAFT') return 'Sin profesionales invitados';
    const selected = r.invitations.find((i) => i.professionalId === r.selectedProfessionalId)?.professional;
    if (selected) return `Con ${selected.displayName}`;
    const invited = pluralize(r.invitations.length, 'profesional', 'profesionales');
    return `Enviada a ${invited}`;
  }
}
