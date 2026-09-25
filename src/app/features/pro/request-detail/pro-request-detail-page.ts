import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, untracked, viewChildren } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ToastService } from '../../../core/services/toast.service';
import { formatTimestamp } from '../../../core/utils/dates';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { clientName, othersText, proRequestActions, proStateText, urgencyLabel, urgencyTone, whenText } from '../pro-ui';

/**
 * Detalle REAL para el profesional invitado. Muestra solo lo que manda el
 * backend: sin dirección ni teléfono hasta que el cliente lo elige
 * (`contact` deja de ser null recién ahí).
 */
@Component({
  selector: 'app-pro-request-detail-page',
  imports: [RouterLink, BackButton, Icon, SessionPending, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-request-detail-page.html',
})
export class ProRequestDetailPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(ProRequestsStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly req = computed(() => {
    const r = this.store.detail();
    return r && r.id === this.id() ? r : null;
  });
  protected readonly actions = computed(() => (this.req() ? proRequestActions(this.req()!) : null));
  protected readonly tone = urgencyTone;
  protected readonly urgency = urgencyLabel;
  protected readonly others = othersText;
  protected readonly state = proStateText;
  protected readonly client = clientName;
  protected readonly when = whenText;
  protected readonly date = formatTimestamp;

  private readonly alerts = viewChildren<ElementRef<HTMLElement>>('actionAlert');

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.store.hasProfile()) untracked(() => this.store.loadDetail(id, true));
    });
    onTabVisible(() => this.store.loadDetail(this.id(), true));
  }

  protected backToList(): void {
    this.router.navigate(['/pro/solicitudes']);
  }

  protected retry(): void {
    this.store.loadDetail(this.id(), true);
  }

  protected async decline(): Promise<void> {
    const ok = await this.store.decline(this.id());
    if (ok) this.toast.show('Listo. Marcaste que no estás disponible para este pedido.');
    else setTimeout(() => this.alerts().find((e) => e.nativeElement.offsetParent)?.nativeElement.focus());
  }
}
