import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../api/admin-api.service';
import { classifyError } from '../api/api-error';
import { AdminUserDetail, AdminUserItem, AdminUserKind } from '../models/admin';

export type AdminUsersLoad = 'idle' | 'loading' | 'ready' | 'error';

export const USER_MESSAGES = {
  blocked: 'Todavía no se puede dar de baja: tiene un trabajo en curso o una suscripción PRO viva.',
  protected: 'No se puede dar de baja ni borrar tu propia cuenta ni la de otro admin desde el panel.',
  mismatch: 'El email escrito no coincide con el de la cuenta.',
  files: 'No pudimos borrar sus archivos en Cloudinary. No cambió nada: intentá de nuevo en unos minutos.',
  notFound: 'Esa cuenta ya no existe.',
  planBlocked:
    'No se puede dar PRO: paga una suscripción de Mercado Pago (cancelala primero) o la cuenta está dada de baja.',
  noSubscription: 'No tiene una suscripción viva para cancelar.',
  billingOff: 'La contratación online no está habilitada: no hay suscripciones que cancelar.',
  provider: 'Mercado Pago no confirmó la cancelación. No cambió nada: intentá de nuevo.',
  rateLimited: 'Demasiadas acciones seguidas. Esperá un momento.',
  failed: 'No pudimos completar la acción. Intentá de nuevo.',
} as const;

/**
 * Gestión de usuarios (panel admin). La búsqueda queda en el store (root) para
 * que volver del detalle conserve la lista. La autoridad es el backend: bloqueos,
 * cuentas protegidas y confirmación por email se validan allá.
 */
@Injectable({ providedIn: 'root' })
export class AdminUsersStore {
  private readonly api = inject(AdminApiService);

  readonly q = signal('');
  readonly kind = signal<AdminUserKind>('active');
  readonly page = signal(1);
  readonly items = signal<AdminUserItem[]>([]);
  readonly total = signal(0);
  readonly pageSize = signal(25);
  readonly state = signal<AdminUsersLoad>('idle');

  readonly detail = signal<AdminUserDetail | null>(null);
  readonly detailState = signal<AdminUsersLoad>('idle');
  readonly acting = signal(false);
  readonly actionError = signal<string | null>(null);

  private listSeq = 0;
  private detailSeq = 0;

  async load(): Promise<void> {
    const seq = ++this.listSeq;
    this.state.set('loading');
    try {
      const res = await firstValueFrom(
        this.api.users({ q: this.q(), kind: this.kind(), page: this.page() }),
      );
      if (seq !== this.listSeq) return; // llegó una búsqueda más nueva
      this.items.set(res.items);
      this.total.set(res.total);
      this.pageSize.set(res.pageSize);
      this.state.set('ready');
    } catch {
      if (seq === this.listSeq) this.state.set('error');
    }
  }

  search(q: string): Promise<void> {
    this.q.set(q);
    this.page.set(1);
    return this.load();
  }

  filter(kind: AdminUserKind): Promise<void> {
    this.kind.set(kind);
    this.page.set(1);
    return this.load();
  }

  goToPage(page: number): Promise<void> {
    this.page.set(page);
    return this.load();
  }

  async open(id: string): Promise<void> {
    const seq = ++this.detailSeq;
    if (this.detail()?.user.id !== id) {
      this.detail.set(null);
      this.actionError.set(null);
    }
    this.detailState.set('loading');
    try {
      const res = await firstValueFrom(this.api.user(id));
      if (seq !== this.detailSeq) return;
      this.detail.set(res);
      this.detailState.set('ready');
    } catch {
      if (seq === this.detailSeq) this.detailState.set('error');
    }
  }

  async deactivate(id: string): Promise<boolean> {
    return this.act(async () => {
      this.detail.set(await firstValueFrom(this.api.deactivateUser(id)));
      void this.load();
    });
  }

  grantPro(id: string, days: number | null): Promise<boolean> {
    return this.act(async () => {
      this.detail.set(await firstValueFrom(this.api.grantPro(id, days)));
      void this.load();
    });
  }

  revokePro(id: string): Promise<boolean> {
    return this.act(async () => {
      this.detail.set(await firstValueFrom(this.api.revokePro(id)));
      void this.load();
    });
  }

  cancelSubscription(id: string): Promise<boolean> {
    return this.act(async () => {
      this.detail.set(await firstValueFrom(this.api.cancelSubscription(id)));
    });
  }

  /** true = borrada: quien llama vuelve al listado. */
  async purge(id: string, confirmEmail: string): Promise<boolean> {
    return this.act(async () => {
      await firstValueFrom(this.api.purgeUser(id, confirmEmail.trim()));
      this.detail.set(null);
      void this.load();
    });
  }

  private async act(call: () => Promise<void>): Promise<boolean> {
    if (this.acting()) return false;
    this.acting.set(true);
    this.actionError.set(null);
    try {
      await call();
      return true;
    } catch (error) {
      const e = classifyError(error);
      const byCode: Record<string, string> = {
        ACCOUNT_DELETE_BLOCKED: USER_MESSAGES.blocked,
        ADMIN_USER_PROTECTED: USER_MESSAGES.protected,
        ADMIN_CONFIRM_MISMATCH: USER_MESSAGES.mismatch,
        ACCOUNT_DELETE_FAILED: USER_MESSAGES.files,
        ADMIN_PLAN_BLOCKED: USER_MESSAGES.planBlocked,
        BILLING_NO_SUBSCRIPTION: USER_MESSAGES.noSubscription,
        BILLING_NOT_CONFIGURED: USER_MESSAGES.billingOff,
        BILLING_PROVIDER_ERROR: USER_MESSAGES.provider,
      };
      this.actionError.set(
        (e.code && byCode[e.code]) ??
          (e.kind === 'not-found'
            ? USER_MESSAGES.notFound
            : e.kind === 'rate-limited'
              ? USER_MESSAGES.rateLimited
              : USER_MESSAGES.failed),
      );
      // Algo cambió del otro lado (bloqueo nuevo, ya borrada): se relee el detalle.
      if (e.kind === 'conflict' || e.kind === 'not-found') {
        const id = this.detail()?.user.id;
        if (id) void this.open(id);
      }
      return false;
    } finally {
      this.acting.set(false);
    }
  }
}
