import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CITY } from '../../../core/data/catalog.data';
import { avatarOf } from '../../../core/models/avatar';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { MAX_COMPARE, SearchStore } from '../../../core/state/search.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { CompareDialog } from './compare-dialog/compare-dialog';
import { ResultCard } from './result-card/result-card';
import { ResultCardMobile } from './result-card-mobile/result-card-mobile';

@Component({
  selector: 'app-results-page',
  imports: [
    RouterLink,
    Avatar,
    BackButton,
    Icon,
    ChipDirective,
    CompareDialog,
    ResultCard,
    ResultCardMobile,
    ServicePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './results-page.html',
})
export class ResultsPage {
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStore);
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly pros = inject(ProfessionalsStore);
  protected readonly zones = inject(ZonesStore);

  protected readonly city = CITY;
  protected readonly draft = this.request.draft;
  protected readonly filters = this.pros.filters;
  protected readonly skeletons = [1, 2, 3];
  protected readonly maxCompare = MAX_COMPARE;
  protected readonly ratingOptions = [
    { value: null, label: 'Todas' },
    { value: 4.5, label: '4,5 +' },
    { value: 4.8, label: '4,8 +' },
  ];

  /** Mobile: paneles desplegables debajo de los chips. */
  protected readonly showCategories = signal(false);
  protected readonly showZones = signal(false);

  protected readonly selected = computed(() =>
    this.search.selected().map((p) => ({ pro: p, avatar: avatarOf(p) })),
  );
  protected readonly zoneName = computed(() => this.zones.byId(this.filters().zoneId)?.name ?? null);
  /** El servicio del pedido no existe (o ya no está activo) en el catálogo. */
  protected readonly unknownService = computed(() => this.catalog.loaded() && !this.request.service());

  protected readonly title = computed(() => {
    if (this.pros.pending()) return `Buscando en ${CITY}…`;
    const n = this.pros.resultCount();
    return `${pluralize(n, 'profesional', 'profesionales')} para ${this.request.serviceName() || 'tu pedido'}`;
  });

  protected readonly mobileCount = computed(() => {
    if (this.pros.pending()) return `Buscando profesionales en ${CITY}…`;
    if (this.pros.error()) return '';
    const n = this.pros.resultCount();
    return n > 1
      ? `${pluralize(n, 'profesional', 'profesionales')} en ${CITY} · tocá ✓ para comparar hasta ${MAX_COMPARE}`
      : `${pluralize(n, 'profesional', 'profesionales')} en ${CITY}`;
  });

  protected readonly selectionTitle = computed(() => {
    const n = this.selected().length;
    return n >= 2 ? `${n} profesionales seleccionados` : '1 profesional seleccionado';
  });
  protected readonly selectionHint = computed(() => {
    const n = this.selected().length;
    if (n < 2) return 'Sumá al menos uno más para comparar';
    return n < MAX_COMPARE ? 'Podés sumar uno más' : 'Máximo alcanzado';
  });
  protected readonly askSelectedLabel = computed(() => {
    const n = this.selected().length;
    return n === 1 ? 'Pedir presupuesto' : `Pedir presupuesto a los ${n}`;
  });
  protected readonly askSelectedLabelMobile = computed(() => {
    const n = this.selected().length;
    return `Pedir presupuesto a ${pluralize(n, 'profesional', 'profesionales')}`;
  });

  constructor() {
    this.zones.load();
    // El servicio del pedido se resuelve a su id real con el catálogo; si el
    // catálogo llega después, la búsqueda arranca en ese momento.
    effect(() => {
      const service = this.request.service();
      const unknown = this.unknownService();
      untracked(() => {
        if (service) this.search.enter();
        else if (unknown) this.pros.setFilters({ serviceId: null });
      });
    });
  }

  protected pickService(service: Service): void {
    this.showCategories.set(false);
    this.search.changeService(service);
  }

  protected setZone(zoneId: string | null): void {
    this.showZones.set(false);
    this.pros.setFilters({ zoneId });
  }

  protected onZoneSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.setZone(value || null);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  protected editRequest(): void {
    this.request.goToStep(4);
    this.router.navigate(['/solicitud']);
  }

  protected ask(pro: ProfessionalSummary): void {
    this.request.askProfessionals([pro]);
    this.router.navigate(['/presupuesto']);
  }

  protected askSelected(): void {
    this.request.askProfessionals(this.search.selected());
    this.router.navigate(['/presupuesto']);
  }
}
