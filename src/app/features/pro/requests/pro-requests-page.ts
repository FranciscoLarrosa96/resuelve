import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { requestNews } from '../../../core/models/notification';
import { ProServiceRequest } from '../../../core/models/request';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { PRO_REQUEST_TABS, ProRequestsStore, ProRequestsTab } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { tabNewsLabel } from '../../../core/utils/badges';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { earliest, refreshWhenDue } from '../../../core/utils/refresh-when-due';
import { completionDeadline } from '../../../core/models/request-status';
import { QuoteUsageMeter } from '../../../shared/components/quote-usage/quote-usage';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { Icon } from '../../../shared/components/icon/icon';
import { Tag, TagTone } from '../../../shared/components/tag/tag';
import { RequestUrgency } from '../../../core/models/request';
import { PRO_STATE_TONES, clientName, othersText, proPersonalState, proRequestActions, urgencyLabel, whenText } from '../pro-ui';

const LIMIT_DISMISSED_KEY = 'resuelve.freeLimitDismissed';

function readDismissed(): string | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(LIMIT_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Solicitudes REALES que recibió el profesional (GET /pro/requests, filtrado en el backend). */
@Component({
  selector: 'app-pro-requests-page',
  imports: [NgTemplateOutlet, RouterLink, Icon, QuoteUsageMeter, SessionPending, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-requests-page.html',
})
export class ProRequestsPage {
  protected readonly store = inject(ProRequestsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly pro = inject(ProStore);

  /** Cupo FREE del mes (discreto hasta que quedan 3). null = todavía no se sabe. */
  protected readonly usage = computed(() => this.pro.ownProfile()?.quoteUsage ?? null);
  protected readonly unlimited = computed(() => !!this.pro.entitlements()?.canSendUnlimitedQuotes);
  /** "Seguir con Free" en el bloque del límite: no vuelve a aparecer este mes en esta pestaña. */
  private readonly dismissedPeriod = signal(readDismissed());
  protected readonly limitDismissed = computed(() => {
    const p = this.usage()?.period;
    return !!p && this.dismissedPeriod() === `${p.year}-${p.month}`;
  });

  protected dismissLimit(): void {
    const p = this.usage()?.period;
    if (!p) return;
    const key = `${p.year}-${p.month}`;
    this.dismissedPeriod.set(key);
    try {
      sessionStorage.setItem(LIMIT_DISMISSED_KEY, key);
    } catch {
      /* sin storage: vale para esta vista */
    }
  }

  protected readonly tabs = PRO_REQUEST_TABS;
  protected readonly urgency = urgencyLabel;
  protected readonly actions = proRequestActions;
  protected readonly others = othersText;
  protected readonly state = proPersonalState;
  protected readonly stateTone = PRO_STATE_TONES;
  protected readonly client = clientName;
  protected readonly when = whenText;
  protected readonly date = formatTimestamp;
  /** Urgente en terracota, "Para hoy" en verde, "Puede esperar" neutro (siempre con texto). */
  protected urgencyTag(u: RequestUrgency): TagTone {
    return u === 'URGENT' ? 'accent' : u === 'TODAY' ? 'brand' : 'neutral';
  }

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
    // "¿Terminaste este trabajo?" lo decide el backend: se relee cuando termina el próximo horario.
    refreshWhenDue(
      () => earliest(this.store.items().map((r) => (r.selectedByClient ? completionDeadline(r) : null))),
      () => this.store.load(true),
    );
  }

  /** Novedad sin leer del modo profesional ("Horario confirmado", "Te eligieron"). */
  protected news(r: ProServiceRequest): string | null {
    return requestNews(this.notifications.proByRequest().get(r.id) ?? []);
  }

  /** Novedades de la pestaña ("Todas" no suma: cada novedad ya está en su grupo). */
  protected tabNews(tab: ProRequestsTab): number {
    return tab === 'ALL' ? 0 : this.notifications.proTabNews(tab);
  }

  protected tabLabel(t: { key: ProRequestsTab; label: string }): string {
    return tabNewsLabel(t.label, this.tabNews(t.key));
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
