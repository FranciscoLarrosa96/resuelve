import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PRO_REQUEST_TABS, ProRequestsStore, ProRequestsTab } from '../../../core/state/pro-requests.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { Icon } from '../../../shared/components/icon/icon';
import { PRO_STATE_TONES, clientName, othersText, proPersonalState, proRequestActions, urgencyLabel, whenText } from '../pro-ui';

/** Solicitudes REALES que recibió el profesional (GET /pro/requests, filtrado en el backend). */
@Component({
  selector: 'app-pro-requests-page',
  imports: [NgTemplateOutlet, RouterLink, Icon, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-requests-page.html',
})
export class ProRequestsPage {
  protected readonly store = inject(ProRequestsStore);

  protected readonly tabs = PRO_REQUEST_TABS;
  protected readonly urgency = urgencyLabel;
  protected readonly actions = proRequestActions;
  protected readonly others = othersText;
  protected readonly state = proPersonalState;
  protected readonly stateTone = PRO_STATE_TONES;
  protected readonly client = clientName;
  protected readonly when = whenText;
  protected readonly date = formatTimestamp;

  /** Desktop: fila seleccionada para la vista previa. */
  protected readonly previewId = signal<string | null>(null);
  protected readonly preview = computed(() => {
    const rows = this.store.items();
    return rows.find((r) => r.id === this.previewId()) ?? rows[0];
  });

  constructor() {
    effect(() => {
      if (this.store.hasProfile()) untracked(() => this.store.load(true));
    });
    onTabVisible(() => this.store.load(true));
  }

  protected setTab(tab: ProRequestsTab): void {
    this.previewId.set(null);
    this.store.setTab(tab);
  }

  protected empty(): { title: string; detail: string | null } {
    switch (this.store.tab()) {
      case 'PENDING':
        return { title: 'No tenés solicitudes nuevas.', detail: 'Cuando un cliente te pida presupuesto, va a aparecer acá.' };
      case 'QUOTED':
        return { title: 'Todavía no enviaste presupuestos.', detail: null };
      case 'SELECTED':
        return { title: 'Todavía no te eligieron en ninguna solicitud.', detail: null };
      default:
        return { title: 'Todavía no recibiste solicitudes.', detail: 'Cuando un cliente te pida presupuesto, va a aparecer acá.' };
    }
  }
}
