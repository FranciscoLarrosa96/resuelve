import { HttpEventType } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { classifyError } from '../api/api-error';
import { TransferApiService } from '../api/transfer-api.service';
import { TransferOverview } from '../models/transfer';
import { ToastService } from '../services/toast.service';
import { ProStore } from './pro.store';

export const TRANSFER_MESSAGES = {
  requestFailed: 'No pudimos preparar el pago. Intentá nuevamente.',
  inReview: 'Ya estamos revisando tu transferencia.',
  blocked: 'Ya tenés Resuelve PRO activo: no hace falta transferir.',
  notAvailable: 'El pago por transferencia no está disponible en este momento.',
  submitted: 'Listo: revisamos tu transferencia y te avisamos.',
  submitFailed: 'No pudimos registrar tu aviso. Intentá nuevamente.',
  uploadFailed: 'No pudimos subir el comprobante. Probá con otro archivo o avisá sin comprobante.',
  invalidFile: 'El comprobante tiene que ser PDF, JPG, PNG o WebP de hasta 10 MB.',
  cancelled: 'Descartaste el pago por transferencia.',
  withdrawn: 'Revocaste el pago. Te avisamos cuando hagamos la devolución.',
  withdrawExpired: 'Ya pasó el plazo de arrepentimiento para ese pago.',
  withdrawFailed: 'No pudimos revocar el pago. Intentá nuevamente.',
  rateLimited: 'Hiciste muchos intentos seguidos. Esperá un minuto e intentá de nuevo.',
} as const;

/** Formatos que acepta el almacenamiento privado (los mismos que el backend revalida). */
export const PROOF_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Pago de Resuelve PRO por transferencia (GET /billing/transfer). El backend
 * decide montos, código y fechas; acá solo se muestra y se avisa. Cuando el
 * plan cambia (confirmado o revocado) se relee /pro/me.
 */
@Injectable({ providedIn: 'root' })
export class TransferStore {
  private readonly api = inject(TransferApiService);
  private readonly pro = inject(ProStore);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly overview = signal<TransferOverview | null>(null);
  readonly loadError = signal(false);
  readonly busy = signal(false);
  /** Progreso de la subida del comprobante (0–100), null sin subida en curso. */
  readonly uploadProgress = signal<number | null>(null);

  /** La opción existe (datos bancarios cargados) y no hay otro PRO pagado que la haga innecesaria. */
  readonly offered = computed(() => {
    const o = this.overview();
    return !!o?.available && !o.blocked;
  });

  async load(): Promise<TransferOverview | null> {
    if (!this.isBrowser) return null;
    try {
      const o = await firstValueFrom(this.api.overview());
      this.apply(o);
      this.loadError.set(false);
      return o;
    } catch {
      this.loadError.set(true);
      return null;
    }
  }

  /** Elige el período: el backend crea el pedido con su código y monto. */
  async request(months: number): Promise<boolean> {
    return this.run(() => firstValueFrom(this.api.request(months)), null, TRANSFER_MESSAGES.requestFailed);
  }

  async cancel(): Promise<boolean> {
    return this.run(() => firstValueFrom(this.api.cancel()), TRANSFER_MESSAGES.cancelled, TRANSFER_MESSAGES.requestFailed);
  }

  /** "Ya transferí": sube el comprobante (si hay) y pasa a revisión. */
  async submit(file: File | null): Promise<boolean> {
    if (this.busy()) return false;
    if (file && (file.size > PROOF_MAX_BYTES || !PROOF_ACCEPT.split(',').includes(file.type))) {
      this.toast.show(TRANSFER_MESSAGES.invalidFile, 3600, 'info');
      return false;
    }
    this.busy.set(true);
    let proofPublicId: string | undefined;
    try {
      if (file) {
        try {
          const ticket = await firstValueFrom(this.api.uploadTicket());
          this.uploadProgress.set(0);
          await lastValueFrom(
            this.api.uploadFile(ticket, file).pipe(
              filter((e) => {
                if (e.type === HttpEventType.UploadProgress && e.total) {
                  this.uploadProgress.set(Math.round((100 * e.loaded) / e.total));
                }
                return e.type === HttpEventType.Response;
              }),
            ),
          );
          proofPublicId = ticket.publicId;
        } catch {
          this.toast.show(TRANSFER_MESSAGES.uploadFailed, 4200, 'info');
          return false;
        } finally {
          this.uploadProgress.set(null);
        }
      }
      this.apply(await firstValueFrom(this.api.submit(proofPublicId)));
      this.toast.show(TRANSFER_MESSAGES.submitted, 3600, 'info');
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.toast.show(
        e.code === 'INVALID_DOCUMENT' ? TRANSFER_MESSAGES.invalidFile : this.messageFor(e, TRANSFER_MESSAGES.submitFailed),
        3600,
        'info',
      );
      void this.load();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async withdraw(refundTo: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      this.apply(await firstValueFrom(this.api.withdraw(refundTo)));
      this.toast.show(TRANSFER_MESSAGES.withdrawn, 3600, 'info');
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.toast.show(
        e.code === 'TRANSFER_WITHDRAWAL_EXPIRED' ? TRANSFER_MESSAGES.withdrawExpired : this.messageFor(e, TRANSFER_MESSAGES.withdrawFailed),
        3600,
        'info',
      );
      if (e.code === 'TRANSFER_WITHDRAWAL_EXPIRED') void this.load();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private async run(call: () => Promise<TransferOverview>, success: string | null, failure: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      this.apply(await call());
      if (success) this.toast.show(success, 3200, 'info');
      return true;
    } catch (error) {
      const e = classifyError(error);
      this.toast.show(this.messageFor(e, failure), 3600, 'info');
      if (e.kind === 'conflict' || e.code === 'TRANSFER_NOT_AVAILABLE') void this.load();
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private messageFor(e: ReturnType<typeof classifyError>, fallback: string): string {
    if (e.kind === 'rate-limited') return TRANSFER_MESSAGES.rateLimited;
    switch (e.code) {
      case 'TRANSFER_IN_REVIEW':
        return TRANSFER_MESSAGES.inReview;
      case 'TRANSFER_BLOCKED':
        return TRANSFER_MESSAGES.blocked;
      case 'TRANSFER_NOT_AVAILABLE':
        return TRANSFER_MESSAGES.notAvailable;
      default:
        return fallback;
    }
  }

  private apply(o: TransferOverview): void {
    const before = this.overview();
    this.overview.set(o);
    // Se confirmó, venció o se revocó un pago: /pro/me tiene que reflejar el plan nuevo.
    if (before && before.proUntil !== o.proUntil) this.pro.refreshProfile();
  }
}
