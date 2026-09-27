import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { LocationApiService } from '../api/location-api.service';

/** ¿Hay proveedor de direcciones? Se pregunta una vez por sesión; si falla, se sigue a mano. */
@Injectable({ providedIn: 'root' })
export class LocationStore {
  private readonly api = inject(LocationApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly enabled = signal(false);
  private requested = false;

  load(): void {
    if (!this.isBrowser || this.requested) return;
    this.requested = true;
    this.api.enabled().subscribe({ next: (v) => this.enabled.set(v), error: () => this.enabled.set(false) });
  }
}
