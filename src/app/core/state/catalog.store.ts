import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { forkJoin } from 'rxjs';
import { CatalogApiService } from '../api/catalog-api.service';
import { Category, Service } from '../models/category';

export const CATALOG_ERROR = 'No pudimos cargar los servicios';

export interface CategoryGroup {
  category: Category;
  services: Service[];
}

/**
 * Catálogo real (categorías y servicios) traído del backend.
 * Se carga una sola vez por sesión; `retry()` / `refresh()` fuerzan otra carga.
 * Si falla, queda en error: nunca se reemplaza por datos mock.
 * En el servidor (prerender) no pide nada: el HTML sale con el esqueleto y
 * el navegador carga el catálogo al hidratar.
 */
@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly api = inject(CatalogApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly categories = signal<Category[]>([]);
  readonly services = signal<Service[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  /** Todavía no hay datos ni error (cargando o sin empezar): mostrar esqueleto. */
  readonly pending = computed(() => !this.loaded() && !this.error());
  /** Cargó bien pero el backend no tiene servicios. */
  readonly empty = computed(() => this.loaded() && this.activeServices().length === 0);

  /**
   * La API ya devuelve solo activos. Además se descartan servicios cuya
   * categoría no vino en /categories (por ejemplo, si se desactivó entre
   * las dos respuestas) y categorías sin servicios.
   */
  readonly activeServices = computed(() => {
    const ids = new Set(this.categories().map((c) => c.id));
    return this.services().filter((s) => ids.has(s.categoryId));
  });

  readonly servicesByCategory = computed<CategoryGroup[]>(() =>
    this.categories()
      .map((category) => ({
        category,
        services: this.activeServices().filter((s) => s.categoryId === category.id),
      }))
      .filter((group) => group.services.length > 0),
  );

  readonly activeCategories = computed(() => this.servicesByCategory().map((g) => g.category));

  private readonly bySlug = computed(() => new Map(this.activeServices().map((s) => [s.slug, s])));
  private readonly byId = computed(() => new Map(this.categories().map((c) => [c.id, c])));

  serviceBySlug(slug: string | null | undefined): Service | undefined {
    return slug ? this.bySlug().get(slug) : undefined;
  }

  categoryBySlug(slug: string | null | undefined): Category | undefined {
    return slug ? this.activeCategories().find((c) => c.slug === slug) : undefined;
  }

  categoryOf(service: Service): Category | undefined {
    return this.byId().get(service.categoryId);
  }

  /** Carga el catálogo si todavía no se cargó ni se está cargando. */
  loadCatalog(): void {
    if (this.loaded() || this.loading()) return;
    this.fetch();
  }

  /** Reintento manual después de un error. */
  retry(): void {
    if (!this.loading()) this.fetch();
  }

  /** Recarga explícita aunque ya esté cargado. */
  refresh(): void {
    this.retry();
  }

  private fetch(): void {
    if (!this.isBrowser) return;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ categories: this.api.getCategories(), services: this.api.getServices() }).subscribe({
      next: ({ categories, services }) => {
        this.categories.set(categories);
        this.services.set(services);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(CATALOG_ERROR);
        this.loading.set(false);
      },
    });
  }
}
