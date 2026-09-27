import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, InjectionToken, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { BillingApiService } from '../api/billing-api.service';
import { BillingStatus } from '../models/billing';
import { ToastService } from '../services/toast.service';
import { ProStore } from './pro.store';

/** Navegación a una URL externa (el `init_point` de Mercado Pago). Token para poder probarla. */
export const EXTERNAL_NAVIGATION = new InjectionToken<(url: string) => void>('EXTERNAL_NAVIGATION', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return (url: string) => doc.location.assign(url);
  },
});

export const BILLING_MESSAGES = {
  checkoutFailed: 'No pudimos iniciar la suscripción. Intentá nuevamente.',
  alreadySubscribed: 'Ya tenés una suscripción a Resuelve PRO.',
  manualPro: 'Ya tenés Resuelve PRO activo. No hace falta suscribirte.',
  notEnabled: 'La contratación online todavía no está habilitada.',
  cancelFailed: 'No pudimos cancelar la suscripción. Intentá nuevamente.',
  cancelled: 'Cancelaste la renovación de Resuelve PRO.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
} as const;

/**
 * Suscripción PRO del profesional (GET /billing/pro/status). El backend es
 * la única fuente de plan, precio y estado: acá nunca se deduce "ya sos PRO"
 * por haber vuelto de Mercado Pago. Cuando el estado cambia el plan, se
 * relee /pro/me para que el badge PRO aparezca sin volver a entrar.
 */
@Injectable({ providedIn: 'root' })
export class BillingStore {
  private readonly api = inject(BillingApiService);
  private readonly pro = inject(ProStore);
  private readonly toast = inject(ToastService);
  private readonly navigate = inject(EXTERNAL_NAVIGATION);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly status = signal<BillingStatus | null>(null);
  readonly loadError = signal(false);
  /** Creando el checkout (y después, navegando a Mercado Pago): el botón queda bloqueado. */
  readonly starting = signal(false);
  readonly cancelling = signal(false);

  readonly subscription = computed(() => this.status()?.subscription ?? null);

  /** Carga (o relee) el estado. Devuelve null si falló. */
  async loadStatus(): Promise<BillingStatus | null> {
    if (!this.isBrowser) return null;
    try {
      const status = await firstValueFrom(this.api.getStatus());
      this.apply(status);
      this.loadError.set(false);
      return status;
    } catch {
      this.loadError.set(true);
      return null;
    }
  }

  /** Igual que `loadStatus`: el backend reconcilia un PENDING reciente contra Mercado Pago. */
  refreshStatus(): Promise<BillingStatus | null> {
    return this.loadStatus();
  }

  /**
   * "Pasarme a PRO": pide el checkout y navega al `init_point`. Un segundo
   * click mientras tanto no hace nada (y el backend igual devolvería el mismo).
   */
  async createCheckout(returnTo?: string): Promise<boolean> {
    if (this.starting()) return false;
    this.starting.set(true);
    try {
      const session = await firstValueFrom(this.api.createCheckout(returnTo));
      this.navigate(session.checkoutUrl);
      return true;
    } catch (error) {
      this.starting.set(false);
      const e = classifyError(error);
      if (e.code === 'BILLING_ALREADY_SUBSCRIBED' || e.code === 'BILLING_MANUAL_PRO_ACTIVE') {
        this.toast.show(
          e.code === 'BILLING_MANUAL_PRO_ACTIVE' ? BILLING_MESSAGES.manualPro : BILLING_MESSAGES.alreadySubscribed,
          3200,
          'info',
        );
        void this.loadStatus();
      } else if (e.code === 'BILLING_NOT_CONFIGURED') {
        this.toast.show(BILLING_MESSAGES.notEnabled, 3200, 'info');
      } else {
        this.toast.show(e.kind === 'rate-limited' ? BILLING_MESSAGES.rateLimited : BILLING_MESSAGES.checkoutFailed, 3600, 'info');
      }
      return false;
    }
  }

  async cancelSubscription(): Promise<boolean> {
    if (this.cancelling()) return false;
    this.cancelling.set(true);
    try {
      this.apply(await firstValueFrom(this.api.cancel()));
      this.toast.show(BILLING_MESSAGES.cancelled, 3200, 'info');
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.toast.show(e.kind === 'rate-limited' ? BILLING_MESSAGES.rateLimited : BILLING_MESSAGES.cancelFailed, 3600, 'info');
      if (e.code === 'BILLING_NO_SUBSCRIPTION') void this.loadStatus();
      return false;
    } finally {
      this.cancelling.set(false);
    }
  }

  private apply(status: BillingStatus): void {
    this.status.set(status);
    // El plan cambió respecto de /pro/me (se activó o terminó PRO): releerlo actualiza badge, cupo y menús.
    const current = this.pro.plan();
    if (current && (current.tier !== status.plan || (current.source ?? null) !== status.source)) {
      this.pro.refreshProfile();
    }
  }
}
