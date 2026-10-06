import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../api/admin-api.service';
import { classifyError } from '../api/api-error';
import { AdminReport, AdminReportView } from '../models/admin';

export type AdminReportsLoad = 'idle' | 'loading' | 'ready' | 'error';

export const REPORT_MESSAGES = {
  alreadyResolved:
    'Este reporte ya fue resuelto (desde otra pestaña o la terminal). Actualizamos la lista.',
  invalid: 'El motivo debe tener entre 5 y 300 caracteres.',
  rateLimited: 'Demasiadas acciones seguidas. Esperá un momento.',
  failed: 'No pudimos guardar la decisión. Intentá de nuevo.',
} as const;

/** Panel de reportes de reseñas. La autoridad es el backend: si otra sesión resolvió primero, 409 y se recarga. */
@Injectable({ providedIn: 'root' })
export class AdminReportsStore {
  private readonly api = inject(AdminApiService);

  readonly view = signal<AdminReportView>('open');
  readonly items = signal<AdminReport[]>([]);
  readonly openCount = signal<number | null>(null);
  readonly state = signal<AdminReportsLoad>('idle');
  /** Id del reporte (o reseña) con una acción en curso. */
  readonly acting = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  async load(view: AdminReportView = this.view()): Promise<void> {
    this.view.set(view);
    this.state.set('loading');
    try {
      const res = await firstValueFrom(this.api.reports(view));
      if (this.view() !== view) return;
      this.items.set(res.items);
      this.openCount.set(res.openCount);
      this.state.set('ready');
    } catch {
      if (this.view() === view) this.state.set('error');
    }
  }

  hide(reportId: string, reason: string): Promise<boolean> {
    return this.act(reportId, () => firstValueFrom(this.api.hideReview(reportId, reason.trim())));
  }

  dismiss(reportId: string): Promise<boolean> {
    return this.act(reportId, () => firstValueFrom(this.api.dismissReport(reportId)));
  }

  restore(report: AdminReport): Promise<boolean> {
    return this.act(report.reportId, () => firstValueFrom(this.api.restoreReview(report.reviewId)));
  }

  private async act(id: string, call: () => Promise<unknown>): Promise<boolean> {
    if (this.acting()) return false;
    this.acting.set(id);
    this.actionError.set(null);
    try {
      await call();
      await this.load();
      return true;
    } catch (error) {
      const e = classifyError(error);
      if (e.kind === 'conflict' && e.code === 'REPORT_ALREADY_RESOLVED') {
        this.actionError.set(REPORT_MESSAGES.alreadyResolved);
        void this.load();
      } else {
        this.actionError.set(
          e.kind === 'validation'
            ? REPORT_MESSAGES.invalid
            : e.kind === 'rate-limited'
              ? REPORT_MESSAGES.rateLimited
              : REPORT_MESSAGES.failed,
        );
      }
      return false;
    } finally {
      this.acting.set(null);
    }
  }
}
