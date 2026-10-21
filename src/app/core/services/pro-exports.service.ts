import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api/api.config';
import { ToastService } from './toast.service';

/** Downloads use the normal authenticated HTTP pipeline; no tokens in URLs. */
@Injectable({ providedIn: 'root' })
export class ProExportsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_URL);
  private readonly doc = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);

  quote(id: string): Promise<void> {
    return this.download(`/pro/quotes/${encodeURIComponent(id)}/pdf`, `presupuesto-${id}.pdf`);
  }

  month(year: number, month: number): Promise<void> {
    return this.download('/pro/analytics/month/export', `resuelve-${year}-${String(month).padStart(2, '0')}.csv`, new HttpParams().set('year', year).set('month', month));
  }

  private async download(path: string, name: string, params?: HttpParams): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    let url: string | null = null;
    try {
      const blob = await firstValueFrom(this.http.get(this.base + path, { responseType: 'blob', params }));
      url = URL.createObjectURL(blob);
      const link = this.doc.createElement('a');
      link.href = url;
      link.download = name;
      this.doc.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      this.toast.show('No pudimos descargar el archivo. Revisá tu conexión y que PRO siga activo.', 3500, 'info');
    } finally {
      if (url) { const created = url; setTimeout(() => URL.revokeObjectURL(created), 60_000); }
      this.busy.set(false);
    }
  }
}
