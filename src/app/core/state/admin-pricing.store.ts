import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../api/admin-api.service';
import { classifyError } from '../api/api-error';
import { AdminProPricing, PRO_PRICE_LIMITS } from '../models/admin';

export type AdminPricingLoad = 'idle' | 'loading' | 'ready' | 'error';

export const PRICING_MESSAGES = {
  unchanged: 'Ese ya es el precio vigente.',
  invalid: `El precio debe ser un monto entero entre $ ${PRO_PRICE_LIMITS.min.toLocaleString('es-AR')} y $ ${PRO_PRICE_LIMITS.max.toLocaleString('es-AR')}.`,
  rateLimited: 'Demasiadas acciones seguidas. Esperá un momento.',
  failed: 'No pudimos guardar el precio. Intentá de nuevo.',
} as const;

/** Precio mensual de PRO (panel admin). La autoridad es el backend: valida, guarda el historial y lo aplica a lo nuevo. */
@Injectable({ providedIn: 'root' })
export class AdminPricingStore {
  private readonly api = inject(AdminApiService);

  readonly pricing = signal<AdminProPricing | null>(null);
  readonly state = signal<AdminPricingLoad>('idle');
  readonly saving = signal(false);
  readonly actionError = signal<string | null>(null);

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.pricing.set(await firstValueFrom(this.api.pricing()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  async save(monthlyPriceArs: number): Promise<boolean> {
    if (this.saving()) return false;
    this.saving.set(true);
    this.actionError.set(null);
    try {
      this.pricing.set(await firstValueFrom(this.api.setPricing(monthlyPriceArs)));
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.actionError.set(
        e.kind === 'conflict' && e.code === 'PRO_PRICE_UNCHANGED'
          ? PRICING_MESSAGES.unchanged
          : e.kind === 'validation'
            ? PRICING_MESSAGES.invalid
            : e.kind === 'rate-limited'
              ? PRICING_MESSAGES.rateLimited
              : PRICING_MESSAGES.failed,
      );
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
