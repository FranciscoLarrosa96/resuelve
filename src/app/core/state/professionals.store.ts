import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { ProfessionalDetail, ProfessionalFilters, ProfessionalSummary } from '../models/professional';
import { CatalogStore } from './catalog.store';

export const PROFESSIONALS_ERROR = 'No pudimos cargar los profesionales';
const PAGE_SIZE = 20;
/** Reseñas por página (la primera viene con el perfil; REVIEWS_PAGE_SIZE del backend). */
export const REVIEWS_PAGE_SIZE = 10;

/** Filtros del listado. Todo por id real (servicio y zona del backend). */
export interface ListFilters {
  serviceId: string | null;
  zoneId: string | null;
  availableToday: boolean;
  licenseVerified: boolean;
  minRating: number | null;
}

export const EMPTY_LIST_FILTERS: ListFilters = {
  serviceId: null,
  zoneId: null,
  availableToday: false,
  licenseVerified: false,
  minRating: null,
};

export type DetailError = 'not-found' | 'error';

/**
 * Profesionales reales (GET /professionals y /professionals/:id).
 * El backend es la fuente de verdad: filtra, ordena y pagina. Si falla o
 * devuelve cero, se muestra error o vacío: nunca datos mock.
 * En el servidor (prerender) no pide nada.
 */
@Injectable({ providedIn: 'root' })
export class ProfessionalsStore {
  private readonly api = inject(ProfessionalsApiService);
  private readonly catalog = inject(CatalogStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ---- Listado -----------------------------------------------------------
  readonly filters = signal<ListFilters>(EMPTY_LIST_FILTERS);
  readonly items = signal<ProfessionalSummary[]>([]);
  readonly total = signal(0);
  readonly page = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  /** true cuando `items` corresponde a los filtros actuales. */
  readonly loaded = signal(false);

  readonly resultCount = this.total.asReadonly();
  readonly hasResults = computed(() => this.items().length > 0);
  readonly hasMore = computed(() => this.loaded() && this.items().length < this.total());
  /** Sin respuesta todavía para estos filtros: esqueleto (nunca "vacío" antes de tiempo). */
  readonly pending = computed(() => !this.loaded() && !this.error());
  readonly empty = computed(() => this.loaded() && this.items().length === 0);
  readonly selectedService = computed(() => {
    const id = this.filters().serviceId;
    return this.catalog.activeServices().find((s) => s.id === id);
  });
  /** Filtros aplicados además del servicio. */
  readonly activeFilters = computed(() => {
    const f = this.filters();
    return [f.zoneId, f.availableToday, f.licenseVerified, f.minRating].filter(Boolean).length;
  });

  // ---- Perfil --------------------------------------------------------------
  readonly selected = signal<ProfessionalDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<DetailError | null>(null);
  /** "Ver más reseñas": se agregan al perfil cargado. */
  readonly reviewsLoading = signal(false);
  readonly reviewsError = signal(false);
  readonly hasMoreReviews = computed(() => {
    const p = this.selected();
    return !!p && p.reviews.length < p.reviewsCount;
  });

  private listKey: string | null = null;
  private listSub?: Subscription;
  private detailId: string | null = null;
  private detailSub?: Subscription;

  setFilters(patch: Partial<ListFilters>): void {
    const next = { ...this.filters(), ...patch };
    if (!next.serviceId || !this.catalog.activeServices().find((s) => s.id === next.serviceId)?.requiresLicense) {
      next.licenseVerified = false;
    }
    this.filters.set(next);
    this.load();
  }

  /** Quita los filtros opcionales (conserva el servicio). */
  clearFilters(): void {
    this.setFilters({ ...EMPTY_LIST_FILTERS, serviceId: this.filters().serviceId });
  }

  /** Carga la primera página para los filtros actuales (no repite si ya está). */
  load(force = false): void {
    if (!this.isBrowser) return;
    const key = JSON.stringify(this.filters());
    if (!force && key === this.listKey && (this.loaded() || this.loading())) return;
    this.listKey = key;
    this.listSub?.unsubscribe();
    this.loading.set(true);
    this.loadingMore.set(false);
    this.loaded.set(false);
    this.error.set(null);
    this.listSub = this.api.getProfessionals(this.query(1)).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.page.set(res.page);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.total.set(0);
        this.error.set(PROFESSIONALS_ERROR);
        this.loading.set(false);
      },
    });
  }

  retry(): void {
    this.load(true);
  }

  /** Datos públicos cambiaron (p. ej. el profesional editó su perfil): la próxima carga vuelve al backend. */
  invalidate(): void {
    this.listKey = '';
    this.detailId = null;
  }

  /** Página siguiente del backend (sin paginar en el cliente). */
  loadMore(): void {
    if (!this.hasMore() || this.loadingMore() || this.loading()) return;
    this.loadingMore.set(true);
    const key = this.listKey;
    this.listSub = this.api.getProfessionals(this.query(this.page() + 1)).subscribe({
      next: (res) => {
        if (key !== this.listKey) return;
        const seen = new Set(this.items().map((p) => p.id));
        this.items.update((list) => [...list, ...res.items.filter((p) => !seen.has(p.id))]);
        this.total.set(res.total);
        this.page.set(res.page);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  /** Perfil público. No repite la request si ya está cargado (o cargando) ese id. */
  loadDetail(id: string, force = false): void {
    if (!this.isBrowser) return;
    if (!force && id === this.detailId && (this.selected() || this.detailLoading())) return;
    this.detailId = id;
    this.detailSub?.unsubscribe();
    this.selected.set(null);
    this.detailError.set(null);
    this.reviewsError.set(false);
    this.detailLoading.set(true);
    this.detailSub = this.api.getProfessionalById(id).subscribe({
      next: (detail) => {
        this.selected.set(detail);
        this.detailLoading.set(false);
      },
      error: (err: unknown) => {
        // 400 = id con formato inválido: para quien navega, también "no existe".
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        this.detailError.set(status === 404 || status === 400 ? 'not-found' : 'error');
        this.detailLoading.set(false);
      },
    });
  }

  /** Siguiente página de reseñas del perfil abierto (sin duplicar si llegó una nueva mientras tanto). */
  loadMoreReviews(): void {
    const p = this.selected();
    if (!p || this.reviewsLoading() || !this.hasMoreReviews()) return;
    const page = Math.floor(p.reviews.length / REVIEWS_PAGE_SIZE) + 1;
    this.reviewsLoading.set(true);
    this.reviewsError.set(false);
    this.api.getReviews(p.id, page, REVIEWS_PAGE_SIZE).subscribe({
      next: (res) => {
        const current = this.selected();
        if (current?.id === p.id) {
          const seen = new Set(current.reviews.map((r) => r.id));
          this.selected.set({
            ...current,
            reviews: [...current.reviews, ...res.items.filter((r) => !seen.has(r.id))],
            reviewsCount: res.total,
          });
        }
        this.reviewsLoading.set(false);
      },
      error: () => {
        this.reviewsError.set(true);
        this.reviewsLoading.set(false);
      },
    });
  }

  private query(page: number): ProfessionalFilters {
    const f = this.filters();
    return {
      service: f.serviceId ?? undefined,
      zone: f.zoneId ?? undefined,
      availableToday: f.availableToday || undefined,
      licenseVerified: f.licenseVerified || undefined,
      minRating: f.minRating ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }
}
