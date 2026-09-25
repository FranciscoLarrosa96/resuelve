import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CatalogApiService } from '../api/catalog-api.service';
import { Zone } from '../models/category';

/**
 * Zonas reales de Tandil (GET /zones), para el filtro de profesionales.
 * Una carga por sesión, solo en el navegador. Si falla, el filtro de zona
 * no se ofrece (no hay lista inventada de respaldo).
 */
@Injectable({ providedIn: 'root' })
export class ZonesStore {
  private readonly api = inject(CatalogApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly zones = signal<Zone[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);

  load(): void {
    if (!this.isBrowser || this.loaded() || this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    this.api.getZones().subscribe({
      next: (zones) => {
        this.zones.set(zones);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  byId(id: string | null | undefined): Zone | undefined {
    return this.zones().find((z) => z.id === id);
  }
}
