import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Service } from '../../../core/models/category';
import { CatalogStore } from '../../../core/state/catalog.store';
import { RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { searchServices } from '../../../core/utils/catalog-search';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';

@Component({
  selector: 'app-services-page',
  imports: [RouterLink, CatalogError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-5xl px-5 pt-8 pb-20 md:px-8">
      <a routerLink="/" class="text-sm font-semibold text-brand">← Volver al inicio</a>
      <h1 class="mt-5 font-display text-3xl font-bold tracking-[-0.02em]">Todos los servicios</h1>
      <p class="mt-2 text-muted">Buscá el servicio que necesitás y encontrá profesionales en Tandil.</p>
      <label for="service-catalog-search" class="sr-only">Buscar servicio</label>
      <input id="service-catalog-search" type="search" placeholder="Buscar servicio..." autocomplete="off"
        class="mt-6 w-full rounded-2xl border border-line-input bg-white px-4 py-3 text-base outline-none focus:border-brand"
        [value]="query()" (input)="query.set($any($event.target).value)" />
      @if (catalog.loaded()) {
        @for (group of groups(); track group.category.id) {
          <section class="mt-8">
            <h2 class="font-display text-xl font-bold">{{ group.category.name }}</h2>
            <div class="mt-3 divide-y divide-line-soft rounded-2xl border border-line bg-white px-4">
              @for (service of group.services; track service.id) {
                <button type="button" class="flex w-full items-center justify-between py-3.5 text-left text-[15px] font-medium hover:text-brand"
                  (click)="choose(service)">{{ service.name }} <span aria-hidden="true">→</span></button>
              }
            </div>
          </section>
        } @empty {
          <p class="mt-6 text-muted">{{ catalog.empty() ? 'Todavía no hay servicios disponibles.' : 'No encontramos ese servicio.' }}</p>
        }
      } @else if (catalog.error()) {
        <div class="mt-8"><app-catalog-error /></div>
      } @else {
        <div class="mt-8 flex flex-col gap-8" aria-hidden="true" data-testid="catalog-skeleton">
          @for (s of skeletons; track s) {
            <div>
              <div class="shimmer h-5 w-44 rounded-md"></div>
              <div class="mt-3 flex flex-col gap-4 rounded-2xl border border-line bg-white px-4 py-4">
                <div class="shimmer h-4 w-[40%] rounded-md"></div>
                <div class="shimmer h-4 w-[55%] rounded-md"></div>
                <div class="shimmer h-4 w-[35%] rounded-md"></div>
              </div>
            </div>
          }
        </div>
        <p class="sr-only" role="status">Cargando servicios…</p>
      }
    </div>
  `,
})
export class ServicesPage {
  private readonly router = inject(Router);
  private readonly request = inject(RequestStore);
  private readonly search = inject(SearchStore);
  protected readonly catalog = inject(CatalogStore);
  protected readonly query = signal('');
  protected readonly skeletons = [1, 2];

  /** Categorías reales con los servicios que coinciden con la búsqueda. */
  protected readonly groups = computed(() => {
    const matches = new Set(
      searchServices(this.catalog.activeServices(), this.catalog.categories(), this.query()).map((s) => s.id),
    );
    return this.catalog
      .servicesByCategory()
      .map((group) => ({ category: group.category, services: group.services.filter((s) => matches.has(s.id)) }))
      .filter((group) => group.services.length > 0);
  });

  constructor() {
    this.catalog.loadCatalog();
  }

  protected choose(service: Service): void {
    this.request.resetForNewRequest();
    this.search.resetForNewRequest();
    this.request.setService(service);
    this.router.navigate(['/profesionales']);
  }
}
