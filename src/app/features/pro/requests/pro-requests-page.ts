import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IncomingRequest, IncomingUrgency } from '../../../core/models/pro';
import { INCOMING_TABS, ProStore } from '../../../core/state/pro.store';
import { formatARS, oneDecimal, photosLabel } from '../../../core/utils/format';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { othersText, urgencyTone } from '../pro-ui';

type UrgencyFilter = 'all' | IncomingUrgency;

@Component({
  selector: 'app-pro-requests-page',
  imports: [RouterLink, Icon, ChipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-requests-page.html',
})
export class ProRequestsPage {
  private readonly router = inject(Router);
  protected readonly store = inject(ProStore);

  protected readonly tabs = INCOMING_TABS;
  protected readonly urgencyFilters: { key: UrgencyFilter; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'Urgente', label: 'Urgente' },
    { key: 'Para hoy', label: 'Para hoy' },
    { key: 'Puede esperar', label: 'Puede esperar' },
  ];

  protected readonly query = signal('');
  protected readonly urgency = signal<UrgencyFilter>('all');
  /** Desktop: fila seleccionada para la vista previa. */
  protected readonly previewId = signal<string | null>(null);
  /** Mobile: tarjeta abierta. */
  protected readonly openId = signal<string | null>('r1');

  protected readonly tone = urgencyTone;
  protected readonly others = othersText;
  protected readonly photos = photosLabel;
  protected readonly ars = formatARS;
  protected readonly f1 = oneDecimal;

  /** Pestaña actual (desktop: con búsqueda y urgencia). */
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const urgency = this.urgency();
    return this.store
      .requests()
      .filter((r) => this.store.inTab(r, this.store.tab()))
      .filter((r) => urgency === 'all' || r.urgency === urgency)
      .filter((r) => !q || `${r.title} ${r.description} ${r.zone} ${r.client}`.toLowerCase().includes(q));
  });

  /** Mobile: sólo la pestaña. */
  protected readonly cards = computed(() => this.store.requests().filter((r) => this.store.inTab(r, this.store.tab())));

  protected readonly preview = computed(() => {
    const rows = this.rows();
    return rows.find((r) => r.id === this.previewId()) ?? rows[0];
  });

  protected readonly lastColumn = computed(() => {
    const tab = this.store.tab();
    return tab === 'quoted' ? 'Tu presupuesto' : tab === 'accepted' ? 'Estado' : 'Recibida';
  });

  protected setTab(tab: 'new' | 'quoted' | 'accepted'): void {
    this.store.tab.set(tab);
    this.previewId.set(null);
  }

  protected state(r: IncomingRequest): string {
    if (r.status === 'quoted') return formatARS(r.quoteAmount ?? 0);
    if (r.status === 'accepted') return 'Aceptada';
    if (r.status === 'scheduled') return 'Programada';
    if (r.status === 'completed') return 'Finalizada';
    return r.receivedAgo;
  }

  protected photoSlots(r: IncomingRequest): number[] {
    return Array.from({ length: r.photos }, (_, i) => i);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected open(r: IncomingRequest): void {
    this.router.navigate(['/pro/solicitudes', r.id]);
  }

  protected toggleCard(r: IncomingRequest): void {
    this.openId.update((id) => (id === r.id ? null : r.id));
  }
}
