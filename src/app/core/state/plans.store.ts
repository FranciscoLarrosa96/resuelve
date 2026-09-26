import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProAnalyticsApiService } from '../api/pro-analytics-api.service';
import { PlansInfo } from '../models/pro-analytics';

/**
 * Condiciones de los planes (GET /plans: precio PRO y cupo FREE, configurables
 * en el backend). Se pide una vez; si falla, la UI no inventa números: omite
 * el precio y se reintenta en el próximo `load()`.
 */
@Injectable({ providedIn: 'root' })
export class PlansStore {
  private readonly api = inject(ProAnalyticsApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private loading = false;

  readonly info = signal<PlansInfo | null>(null);

  load(): void {
    if (!this.isBrowser || this.info() || this.loading) return;
    this.loading = true;
    this.api.getPlans().subscribe({
      next: (info) => {
        this.info.set(info);
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }
}
