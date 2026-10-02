import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ImpressionContext } from '../../../core/analytics/exposure-tracker';
import { TrackImpression } from '../../../core/analytics/track-impression.directive';
import { CITY } from '../../../core/data/catalog.data';
import { avatarOf } from '../../../core/models/avatar';
import { Service } from '../../../core/models/category';
import { ProfessionalSummary } from '../../../core/models/professional';
import { CatalogStore } from '../../../core/state/catalog.store';
import {
  PROFESSIONALS_PAGE_SIZE,
  ProfessionalsStore,
} from '../../../core/state/professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { pluralize } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { CompareDialog } from './compare-dialog/compare-dialog';
import { CompareTray } from '../compare/compare-tray';
import { ResultCard } from './result-card/result-card';
import { Dialog } from '../../../shared/components/dialog/dialog';

/**
 * /profesionales. Dos formas de llegar, bien separadas:
 *  - Explorar (`/profesionales`, `/profesionales?servicio=plomeria`): listado
 *    limpio del backend. Nunca muestra ni usa un pedido.
 *  - Con un pedido (`/profesionales?pedido=1`, desde "Crear solicitud"): solo
 *    si hay un pedido REAL armado por el cliente; si no, se explora.
 */
@Component({
  selector: 'app-results-page',
  imports: [
    TrackImpression,
    RouterLink,
    BackButton,
    Icon,
    ChipDirective,
    CompareDialog,
    CompareTray,
    ResultCard,
    ServicePicker,
    Dialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './results-page.html',
  styleUrl: './results-page.css',
})
export class ResultsPage {
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly catalog = inject(CatalogStore);
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);
  protected readonly pros = inject(ProfessionalsStore);
  protected readonly zones = inject(ZonesStore);

  protected readonly city = CITY;
  protected readonly draft = this.request.draft;
  protected readonly filters = this.pros.filters;
  protected readonly skeletons = [1, 2, 3];
  protected readonly ratingOptions = [
    { value: null, label: 'Todas' },
    { value: 4.5, label: '4,5 +' },
    { value: 4.8, label: '4,8 +' },
  ];

  /** Mobile: paneles desplegables debajo de los chips. */
  protected readonly showCategories = signal(false);
  protected readonly showZones = signal(false);
  protected readonly filtersOpen = signal(false);

  /** Se entró con un pedido real (y no con un borrador vacío o de otra sesión). */
  protected readonly withRequest = computed(
    () => !!this.params()?.has('pedido') && this.request.hasContext(),
  );
  private readonly serviceSlug = computed(() => this.params()?.get('servicio') ?? '');
  /** Servicio de la URL al explorar (undefined hasta que carga el catálogo o si no existe). */
  private readonly exploreService = computed(() => this.catalog.serviceBySlug(this.serviceSlug()));
  /** Servicio que filtra el listado (el del pedido o el de la URL). */
  protected readonly activeService = computed(() => this.pros.selectedService());
  /** El servicio pedido (pedido o URL) no existe o ya no está activo. */
  protected readonly unknownService = computed(() => {
    if (!this.catalog.loaded()) return false;
    return this.withRequest()
      ? !this.request.service()
      : !!this.serviceSlug() && !this.exploreService();
  });

  /** Contexto de la aparición (servicio, barrio, "Disponible hoy", página). Sin texto libre. */
  protected impression(p: ProfessionalSummary, index: number): ImpressionContext {
    const f = this.filters();
    return {
      professionalId: p.id,
      serviceId: f.serviceId,
      zoneId: f.zoneId,
      isUrgent: f.availableToday,
      isFeaturedPlacement: !!p.isFeaturedPlacement,
      page: Math.floor(index / PROFESSIONALS_PAGE_SIZE) + 1,
    };
  }

  protected readonly selected = computed(() =>
    this.search.selected().map((p) => ({ pro: p, avatar: avatarOf(p) })),
  );
  protected readonly zoneName = computed(
    () => this.zones.byId(this.filters().zoneId)?.name ?? null,
  );

  protected readonly title = computed(() => {
    if (this.withRequest())
      return `Profesionales para ${this.request.serviceName() || 'tu pedido'}`;
    const service = this.activeService();
    return service ? `${service.name} en ${CITY}` : `Profesionales en ${CITY}`;
  });

  protected readonly countText = computed(() => {
    if (this.pros.pending()) return `Buscando en ${CITY}…`;
    if (this.pros.error()) return '';
    const n = this.pros.resultCount();
    const zone = this.zoneName();
    return `${pluralize(n, 'profesional', 'profesionales')}${zone ? ` que trabajan en ${zone}` : ''}`;
  });

  constructor() {
    this.zones.load();
    // La URL decide el modo. El servicio se resuelve a su id real con el
    // catálogo; si el catálogo llega después, la búsqueda arranca en ese momento.
    effect(() => {
      const withRequest = this.withRequest();
      const requestService = this.request.service();
      const slug = this.serviceSlug();
      const exploreService = this.exploreService();
      const loaded = this.catalog.loaded();
      untracked(() => {
        if (withRequest) {
          if (requestService) this.search.enterRequest();
          else if (loaded) this.search.explore(null);
        } else if (!slug) {
          this.search.explore(null);
        } else if (exploreService || loaded) {
          this.search.explore(exploreService?.id ?? null);
        }
      });
    });
  }

  protected pickService(service: Service): void {
    this.showCategories.set(false);
    if (this.withRequest()) this.search.changeService(service);
    else this.router.navigate([], { queryParams: { servicio: service.slug }, replaceUrl: true });
  }

  protected onServiceSelect(event: Event): void {
    const slug = (event.target as HTMLSelectElement).value;
    const service = this.catalog.serviceBySlug(slug);
    if (service) this.pickService(service);
    else if (!this.withRequest()) this.allServices();
  }

  /** Explorando: volver a todos los servicios. */
  protected allServices(): void {
    this.showCategories.set(false);
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /** Limpia filtros opcionales y, al explorar, también el servicio de la URL. */
  protected clearFilters(): void {
    this.showCategories.set(false);
    this.showZones.set(false);
    if (this.withRequest()) {
      this.pros.clearFilters();
    } else if (this.serviceSlug()) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    } else {
      this.pros.clearFilters();
    }
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
    this.search.prepareRequest([pro], 'TARGETED');
    this.router.navigate(['/presupuesto']);
  }

  protected askSelected(): void {
    this.search.prepareRequest(this.search.selected(), 'DISCOVERY', 'MULTI_SELECT');
    this.router.navigate(['/presupuesto']);
  }

  /** Entrada escalonada de la lista: 30 ms por ítem, con tope para que nunca demore. */
  protected stagger(index: number): number {
    return Math.min(index, 8) * 30;
  }
}
