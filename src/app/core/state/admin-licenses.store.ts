import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { AdminApiService } from '../api/admin-api.service';
import { AdminListView, AdminVerification, AdminVerificationDetail } from '../models/admin';

export type AdminLoad = 'idle' | 'loading' | 'ready' | 'error';
export type AdminAction = 'approve' | 'reject' | 'purge';

export const ADMIN_MESSAGES = {
  alreadyReviewed: 'Esta matrícula ya fue revisada (desde otra pestaña o la terminal). Actualizamos los datos.',
  invalid: 'Revisá los datos: la fecha no puede ser pasada y el motivo debe tener entre 5 y 300 caracteres.',
  rateLimited: 'Demasiadas acciones seguidas. Esperá un momento.',
  failed: 'No pudimos guardar la decisión. Intentá de nuevo.',
} as const;

/**
 * Panel de matrículas. La autoridad es el backend: si otra sesión decide
 * primero, la acción recibe 409 y se recargan lista y detalle.
 */
@Injectable({ providedIn: 'root' })
export class AdminLicensesStore {
  private readonly api = inject(AdminApiService);

  readonly view = signal<AdminListView>('pending');
  readonly items = signal<AdminVerification[]>([]);
  readonly pendingCount = signal<number | null>(null);
  readonly listState = signal<AdminLoad>('idle');

  readonly detail = signal<AdminVerificationDetail | null>(null);
  readonly detailState = signal<AdminLoad>('idle');
  /** 'not-found' se distingue de un error de red para no ofrecer "Reintentar" en vano. */
  readonly detailMissing = signal(false);

  readonly acting = signal<AdminAction | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly isPendingView = computed(() => this.view() === 'pending');

  async loadList(view: AdminListView = this.view()): Promise<void> {
    this.view.set(view);
    this.listState.set('loading');
    try {
      const res = await firstValueFrom(this.api.list(view));
      if (this.view() !== view) return; // cambió de vista mientras cargaba
      this.items.set(res.items);
      this.pendingCount.set(res.pendingCount);
      this.listState.set('ready');
    } catch {
      if (this.view() === view) this.listState.set('error');
    }
  }

  async open(id: string): Promise<void> {
    if (this.detail()?.item.id !== id) this.detail.set(null);
    this.detailMissing.set(false);
    this.actionError.set(null);
    this.detailState.set('loading');
    try {
      const res = await firstValueFrom(this.api.show(id));
      this.detail.set(res);
      this.detailState.set('ready');
    } catch (error) {
      this.detailMissing.set(classifyError(error).kind === 'not-found' || classifyError(error).kind === 'validation');
      this.detailState.set('error');
    }
  }

  close(): void {
    this.detail.set(null);
    this.detailState.set('idle');
    this.actionError.set(null);
  }

  /** Pendiente que sigue a `id` en la lista (o la anterior si era la última). Llamar ANTES de decidir. */
  nextPendingAfter(id: string): string | null {
    const list = this.items().filter((v) => v.status === 'PENDING');
    const i = list.findIndex((v) => v.id === id);
    const rest = list.filter((v) => v.id !== id);
    if (!rest.length) return null;
    return (rest[i] ?? rest[rest.length - 1]).id;
  }

  approve(id: string, expiresAt: string | null): Promise<boolean> {
    return this.decide('approve', id, () => this.api.approve(id, expiresAt));
  }

  reject(id: string, reason: string): Promise<boolean> {
    return this.decide('reject', id, () => this.api.reject(id, reason.trim()));
  }

  async purgeDocument(id: string): Promise<boolean> {
    return this.decide('purge', id, () => this.api.purgeDocument(id));
  }

  private async decide(
    action: AdminAction,
    id: string,
    call: () => ReturnType<AdminApiService['approve']>,
  ): Promise<boolean> {
    if (this.acting()) return false;
    this.acting.set(action);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(call());
      const wasPending = this.items().some((v) => v.id === id && v.status === 'PENDING');
      if (this.isPendingView()) this.items.update((list) => list.filter((v) => v.id !== id));
      else this.items.update((list) => list.map((v) => (v.id === id ? updated : v)));
      if (wasPending) this.pendingCount.update((n) => (n === null ? n : Math.max(0, n - 1)));
      this.detail.update((d) => (d && d.item.id === id ? { ...d, item: updated, documentUrl: updated.document ? d.documentUrl : null } : d));
      return true;
    } catch (error) {
      const e = classifyError(error);
      if (e.kind === 'conflict' && e.code === 'VERIFICATION_ALREADY_REVIEWED') {
        this.actionError.set(ADMIN_MESSAGES.alreadyReviewed);
        void this.loadList();
        void this.refreshDetail(id);
      } else {
        this.actionError.set(
          e.kind === 'validation' ? ADMIN_MESSAGES.invalid
          : e.kind === 'rate-limited' ? ADMIN_MESSAGES.rateLimited
          : ADMIN_MESSAGES.failed,
        );
      }
      return false;
    } finally {
      this.acting.set(null);
    }
  }

  /** Recarga el detalle sin borrar el mensaje de error que explica por qué. */
  private async refreshDetail(id: string): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.show(id));
      if (this.detail()?.item.id === id) this.detail.set(res);
    } catch {
      /* el detalle viejo queda; la lista ya se recargó */
    }
  }
}
