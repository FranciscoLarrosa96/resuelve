import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { requestNews } from '../../../core/models/notification';
import { ProServiceRequest } from '../../../core/models/request';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { PRO_REQUEST_TABS, ProRequestsStore, ProRequestsTab } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { quoteUsageNotice } from '../../../core/utils/quote-usage';
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
  private readonly notifications = inject(NotificationsStore);
  private readonly pro = inject(ProStore);

  /** Cupo FREE del mes (discreto hasta que quedan 3). null = todavía no se sabe. */
  protected readonly usage = computed(() => {
    const u = this.pro.ownProfile()?.quoteUsage;
    return u ? { ...quoteUsageNotice(u), unlimited: !!this.pro.entitlements()?.canSendUnlimitedQuotes } : null;
  });

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
    this.pro.refreshProfile();
    onTabVisible(() => {
      this.store.load(true);
      this.pro.refreshProfile();
    });
    // Novedad nueva (te eligieron, confirmaron o pidieron otro horario): se relee sin F5.
    let arrivals = this.notifications.arrivals();
    effect(() => {
      const next = this.notifications.arrivals();
      if (next !== arrivals) untracked(() => this.store.load(true));
      arrivals = next;
    });
  }

  /** Novedad sin leer del modo profesional ("Horario confirmado", "Te eligieron"). */
  protected news(r: ProServiceRequest): string | null {
    return requestNews(this.notifications.proByRequest().get(r.id) ?? []);
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
