import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Service } from '../../../core/models/category';
import { CatalogStore } from '../../../core/state/catalog.store';
import { searchServices } from '../../../core/utils/catalog-search';
import { CatalogError } from '../../../shared/components/catalog-error/catalog-error';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';

@Component({
  selector: 'app-services-page',
  imports: [RouterLink, CatalogError, ServiceIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .service-catalog {
      max-width: 1400px;
    }
    .catalog-groups {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 56px;
    }
    .catalog-group {
      margin-top: 36px;
    }
    .catalog-group h2 {
      font-family: var(--font-sans);
      font-size: 22px;
      letter-spacing: -0.025em;
    }
    .catalog-group button {
      min-height: 64px;
    }
    .catalog-group button > span:last-child {
      transition: transform var(--duration-micro) var(--ease-out-soft);
    }
    .catalog-group button:hover > span:last-child {
      transform: translateX(2px);
    }
    @media (min-width: 1600px) {
      .catalog-groups {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @media (max-width: 767px) {
      .catalog-groups {
        grid-template-columns: 1fr;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .catalog-group button > span:last-child {
        transition: none;
        transform: none !important;
      }
    }
  `,
  template: `
    <div class="service-catalog mx-auto px-5 pt-8 pb-20 md:px-8">
      <a routerLink="/" class="text-sm font-semibold text-brand">← Volver al inicio</a>
      <h1 class="mt-5 font-display text-3xl font-bold tracking-[-0.02em]">Todos los servicios</h1>
      <p class="mt-2 text-muted">
        Buscá el servicio que necesitás y encontrá profesionales en Tandil.
      </p>
      <label for="service-catalog-search" class="sr-only">Buscar servicio</label>
      <input
        id="service-catalog-search"
        type="search"
        placeholder="Buscar servicio..."
        autocomplete="off"
        class="mt-6 w-full rounded-2xl field-control px-4 py-3 text-base"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
      @if (catalog.loaded()) {
        <div class="catalog-groups">
          @for (group of groups(); track group.category.id) {
            <section class="catalog-group">
              <h2 class="font-display text-xl font-bold">{{ group.category.name }}</h2>
              <div class="mt-3 divide-y divide-line-soft">
                @for (service of group.services; track service.id) {
                  <button
                    type="button"
                    class="flex w-full items-center justify-between py-3.5 text-left text-[15px] font-medium hover:text-brand"
                    (click)="choose(service)"
                  >
                    <span class="flex items-center gap-3"
                      ><app-service-icon [slug]="service.slug" class="text-brand" />{{
                        service.name
                      }} </span
                    ><span aria-hidden="true">→</span>
                  </button>
                }
              </div>
            </section>
          } @empty {
            <p class="mt-6 text-muted">
              {{
                catalog.empty()
                  ? 'Todavía no hay servicios disponibles.'
                  : 'No encontramos ese servicio.'
              }}
            </p>
          }
        </div>
      } @else if (catalog.error()) {
        <div class="mt-8"><app-catalog-error /></div>
      } @else {
        <div class="mt-8 flex flex-col gap-8" aria-hidden="true" data-testid="catalog-skeleton">
          @for (s of skeletons; track s) {
            <div>
              <div class="shimmer h-5 w-44 rounded-md"></div>
              <div
                class="mt-3 flex flex-col gap-4 rounded-2xl border border-line bg-surface px-4 py-4"
              >
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
  protected readonly catalog = inject(CatalogStore);
  protected readonly query = signal('');
  protected readonly skeletons = [1, 2];

  /** Categorías reales con los servicios que coinciden con la búsqueda. */
  protected readonly groups = computed(() => {
    const matches = new Set(
      searchServices(this.catalog.activeServices(), this.catalog.categories(), this.query()).map(
        (s) => s.id,
      ),
    );
    return this.catalog
      .servicesByCategory()
      .map((group) => ({
        category: group.category,
        services: group.services.filter((s) => matches.has(s.id)),
      }))
      .filter((group) => group.services.length > 0);
  });

  constructor() {
    this.catalog.loadCatalog();
  }

  /** Explorar profesionales de ese servicio (sin armar un pedido). */
  protected choose(service: Service): void {
    this.router.navigate(['/profesionales'], { queryParams: { servicio: service.slug } });
  }
}
