import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LocationApiService } from '../api/location-api.service';
import { LocationConfig } from '../models/location';

/** Estado del proveedor de direcciones y la clave pública de tiles. Se consulta una vez por sesión. */
@Injectable({ providedIn: 'root' })
export class LocationStore {
  private readonly api = inject(LocationApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly enabled = signal(false);
  readonly mapApiKey = signal<string | null>(null);
  private requested = false;

  load(): void {
    if (!this.isBrowser || this.requested) return;
    this.requested = true;
    this.api.enabled().subscribe({
      next: (config: LocationConfig) => {
        this.enabled.set(config.enabled);
        this.mapApiKey.set(config.mapApiKey);
      },
      error: () => {
        this.enabled.set(false);
        this.mapApiKey.set(null);
      },
    });
  }
}
