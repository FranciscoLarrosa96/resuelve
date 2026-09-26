import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { URGENT_SERVICE_SLUGS } from '../../../core/data/catalog.data';
import { avatarOf } from '../../../core/models/avatar';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { CatalogStore } from '../../../core/state/catalog.store';
import { PROFESSIONALS_ERROR } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';

/**
 * Urgencias: profesionales REALES que marcaron "Disponible hoy" para el
 * servicio (GET /professionals?service=<id>&availableToday=true). Lista
 * propia de la pantalla para no pisar los filtros de /profesionales.
 * "Pedir presupuesto urgente" usa el flujo de pedido (todavía no se envía al backend).
 */
@Component({
  selector: 'app-urgent-page',
  imports: [Avatar, BackButton, ChipDirective, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './urgent-page.html',
})
export class UrgentPage {
  private readonly router = inject(Router);
  private readonly api = inject(ProfessionalsApiService);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  private readonly catalog = inject(CatalogStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Rubros de urgencia que existen en el catálogo real. */
  protected readonly services = computed(() =>
    URGENT_SERVICE_SLUGS.map((slug) => this.catalog.serviceBySlug(slug)).filter((s): s is Service => !!s),
  );
  /** Slug elegido: el del pedido si es de urgencia; si no, Plomería. */
  protected readonly selected = signal(
    URGENT_SERVICE_SLUGS.includes(this.request.draft().service.slug) ? this.request.draft().service.slug : 'plomeria',
  );
  protected readonly items = signal<ProfessionalSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly f1 = oneDecimal;

  protected readonly list = computed(() => this.items().map((p) => ({ pro: p, avatar: avatarOf(p) })));
  protected readonly countText = computed(() => {
    if (this.error()) return '';
    if (!this.loaded()) return 'Buscando quién está disponible hoy…';
    return pluralize(this.total(), 'profesional disponible hoy', 'profesionales disponibles hoy');
  });

  private sub?: Subscription;

  constructor() {
    effect(() => {
      const service = this.catalog.serviceBySlug(this.selected());
      untracked(() => service && this.load(service));
    });
  }

  protected pick(service: Service): void {
    this.selected.set(service.slug);
  }

  protected retry(): void {
    const service = this.catalog.serviceBySlug(this.selected());
    if (service) this.load(service);
  }

  /** Arma un pedido urgente para ese profesional y lleva al resumen, donde se completa y se envía. */
  protected askUrgent(pro: ProfessionalSummary): void {
    const service = this.catalog.serviceBySlug(this.selected());
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    if (service) this.request.setService(service);
    this.request.updateDraft({ urgency: 'URGENT' });
    this.request.askProfessionals([pro]);
    this.router.navigate(['/presupuesto']);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  private load(service: Service): void {
    if (!this.isBrowser) return;
    this.sub?.unsubscribe();
    this.loaded.set(false);
    this.error.set(null);
    this.sub = this.api.getProfessionals({ service: service.id, availableToday: true, pageSize: 20 }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loaded.set(true);
      },
      error: () => {
        this.items.set([]);
        this.error.set(PROFESSIONALS_ERROR);
      },
    });
  }
}
