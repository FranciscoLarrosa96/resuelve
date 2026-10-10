import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { LocalitiesApiService } from '../api/localities-api.service';
import { Zone } from '../models/category';
import { LocalityStore } from './locality.store';

/**
 * Barrios reales de UNA localidad (GET /localities/:id/neighborhoods): por defecto,
 * la ciudad elegida. Una localidad sin barrios cargados devuelve [] y funciona
 * igual (se busca y se pide por ciudad completa). Si falla, el filtro de barrio no
 * se ofrece (no hay lista inventada de respaldo).
 */
@Injectable({ providedIn: 'root' })
export class ZonesStore {
  private readonly api = inject(LocalitiesApiService);
  private readonly locality = inject(LocalityStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sub?: Subscription;

  /** Localidad de la lista cargada (o cargando). */
  readonly localityId = signal<string | null>(null);
  readonly zones = signal<Zone[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);
  /** La localidad tiene barrios: se ofrece elegir barrio. */
  readonly hasZones = computed(() => this.loaded() && this.zones().length > 0);

  /** Carga los barrios de `localityId` (por defecto, la ciudad elegida). No repite si ya están. */
  load(localityId: string | null = this.locality.id()): void {
    if (!this.isBrowser) return;
    if (localityId === this.localityId() && (this.loaded() || this.loading())) return;
    this.sub?.unsubscribe();
    this.localityId.set(localityId);
    this.zones.set([]);
    this.error.set(false);
    if (!localityId) {
      this.loaded.set(true);
      this.loading.set(false);
      return;
    }
    this.loaded.set(false);
    this.loading.set(true);
    this.sub = this.api.neighborhoods(localityId).subscribe({
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

  /** Reintento tras un error (misma localidad). */
  retry(): void {
    const id = this.localityId();
    this.localityId.set(null);
    this.load(id);
  }

  byId(id: string | null | undefined): Zone | undefined {
    return this.zones().find((z) => z.id === id);
  }
}
