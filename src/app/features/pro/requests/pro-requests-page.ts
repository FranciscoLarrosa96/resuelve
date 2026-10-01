import { TabsDirective } from '../../../shared/directives/tabs.directive';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { requestNews } from '../../../core/models/notification';
import { ProServiceRequest } from '../../../core/models/request';
import { NotificationsStore } from '../../../core/state/notifications.store';
import {
  PRO_REQUEST_TABS,
  ProRequestsStore,
  ProRequestsTab,
} from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { formatTimestamp } from '../../../core/utils/dates';
import { tabNewsLabel } from '../../../core/utils/badges';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { earliest, refreshWhenDue } from '../../../core/utils/refresh-when-due';
import { completionDeadline, isWorkDone } from '../../../core/models/request-status';
import { QuoteUsageMeter } from '../../../shared/components/quote-usage/quote-usage';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { Icon } from '../../../shared/components/icon/icon';
import { Tag, TagTone } from '../../../shared/components/tag/tag';
import { RequestUrgency } from '../../../core/models/request';
import {
  PRO_STATE_TONES,
  clientName,
  othersText,
  proPersonalState,
  proRequestActions,
  urgencyLabel,
  whenText,
} from '../pro-ui';

const LIMIT_DISMISSED_KEY = 'resuelve.freeLimitDismissed.v2';

export function initialProRequestsTab(pendingTotal: number): ProRequestsTab {
  return pendingTotal > 0 ? 'PENDING' : 'ALL';
}

function readDismissed(): string | null {
  try {
    return typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(LIMIT_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** Solicitudes REALES que recibió el profesional (GET /pro/requests, filtrado en el backend). */
@Component({
  selector: 'app-pro-requests-page',
  imports: [
    TabsDirective,
    NgTemplateOutlet,
    RouterLink,
    Icon,
    QuoteUsageMeter,
    SessionPending,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-requests-page.html',
  styleUrl: './pro-requests-page.css',
})
export class ProRequestsPage {
  protected readonly store = inject(ProRequestsStore);
  private readonly notifications = inject(NotificationsStore);
  private readonly pro = inject(ProStore);

  /** Cupo Free total (discreto hasta que quedan 3). null = todavía no se sabe. */
  protected readonly usage = computed(() => this.pro.ownProfile()?.quoteUsage ?? null);
  protected readonly unlimited = computed(() => !!this.pro.entitlements()?.canSendUnlimitedQuotes);
  /** "Seguir con Free" oculta el aviso solo durante esta sesión. */
  protected readonly limitDismissed = signal(readDismissed() === 'true');

  protected dismissLimit(): void {
    this.limitDismissed.set(true);
    try {
      sessionStorage.setItem(LIMIT_DISMISSED_KEY, 'true');
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
  protected readonly availableAt = (r: ProServiceRequest): string | null => {
    const value = r.opportunity?.availableToProfessionalAt;
    return value ? formatTimestamp(value) : null;
  };
  /** Urgente en terracota, "Para hoy" en verde, "Puede esperar" neutro (siempre con texto). */
  protected urgencyTag(u: RequestUrgency): TagTone {
    return u === 'URGENT' ? 'accent' : u === 'TODAY' ? 'brand' : 'neutral';
  }

  protected completed(r: ProServiceRequest): boolean {
    return r.job?.status === 'COMPLETED' || isWorkDone(r.status);
  }

  protected detailLabel(r: ProServiceRequest): string {
    if (this.completed(r)) return 'Ver trabajo realizado';
    return this.state(r).tone === 'won' ? 'Ver datos para coordinar' : 'Ver detalle';
  }

  protected detailLink(r: ProServiceRequest): string | string[] {
    if (r.opportunity?.blocked) return '/pro/plan';
    if (this.completed(r) && r.job?.id) return ['/pro/trabajos', r.job.id];
    return ['/pro/solicitudes', r.id];
  }

  /** Desktop: fila seleccionada para la vista previa. */
  protected readonly previewId = signal<string | null>(null);
  protected readonly preview = computed(() => {
    const rows = this.store.items();
    return rows.find((r) => r.id === this.previewId()) ?? rows[0];
  });

  /** Arrow keys move focus and preview together; Enter keeps native button behavior. */
  protected movePreview(event: KeyboardEvent, id: string): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = this.store.items();
    if (!rows.length) return;
    event.preventDefault();
    const current = rows.findIndex((row) => row.id === id);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    this.previewId.set(rows[index].id);
    const list = (event.currentTarget as HTMLElement).closest('.inbox-list');
    list?.querySelectorAll<HTMLButtonElement>('.inbox-row button')[index]?.focus();
  }

  constructor() {
    effect(() => {
      if (this.store.hasProfile()) untracked(() => this.store.load(true));
    });
    // Sin oportunidades nuevas, abrimos "Todas" para no dejar la pantalla vacía.
    effect(() => {
      if (this.store.tab() === 'PENDING' && this.store.loaded()) {
        const next = initialProRequestsTab(this.store.total());
        if (next !== 'PENDING') untracked(() => this.setTab(next));
      }
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
      () =>
        earliest(
          this.store.items().map((r) => (r.selectedByClient ? completionDeadline(r) : null)),
        ),
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
        return {
          title: 'No tenés solicitudes nuevas.',
          detail: 'Cuando un cliente te pida presupuesto, va a aparecer acá.',
        };
      case 'QUOTED':
        return { title: 'Todavía no enviaste presupuestos.', detail: null };
      case 'SELECTED':
        return { title: 'Todavía no te eligieron en ninguna solicitud.', detail: null };
      default:
        return {
          title: 'Todavía no recibiste solicitudes.',
          detail: 'Cuando un cliente te pida presupuesto, va a aparecer acá.',
        };
    }
  }
}
