import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PRO_REQUEST_TABS, ProRequestsStore, ProRequestsTab } from '../../../core/state/pro-requests.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { clientName, othersText, proRequestActions, proStateText, urgencyLabel, urgencyTone, whenText } from '../pro-ui';

/** Solicitudes REALES que recibió el profesional (GET /pro/requests, filtrado en el backend). */
@Component({
  selector: 'app-pro-requests-page',
  imports: [NgTemplateOutlet, RouterLink, SessionPending, StatusPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-requests-page.html',
})
export class ProRequestsPage {
  protected readonly store = inject(ProRequestsStore);

  protected readonly tabs = PRO_REQUEST_TABS;
  protected readonly tone = urgencyTone;
  protected readonly urgency = urgencyLabel;
  protected readonly actions = proRequestActions;
  protected readonly others = othersText;
  protected readonly state = proStateText;
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

  protected emptyText(): string {
    switch (this.store.tab()) {
      case 'PENDING':
        return 'No tenés solicitudes nuevas por ahora.';
      case 'QUOTED':
        return 'Todavía no enviaste presupuestos.';
      case 'SELECTED':
        return 'Todavía no te eligieron en ninguna solicitud.';
      default:
        return 'Todavía no recibiste solicitudes.';
    }
  }
}
