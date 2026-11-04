import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { ToastService } from './toast.service';

/** Resultado de pedir el PDF de un presupuesto. */
export type QuotePdfResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap' | 'error';

/** "Presupuesto-3776AE22-Francisco-Larrosa.pdf": legible y sin caracteres raros. */
export function quotePdfName(quoteId: string, displayName: string): string {
  const who = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ['Presupuesto', quoteId.slice(0, 8).toUpperCase(), who].filter(Boolean).join('-') + '.pdf';
}

/**
 * Descargas del profesional por el pipeline HTTP autenticado (sin tokens en URLs).
 *
 * El PDF del presupuesto, en pantallas táctiles con Web Share de archivos
 * (iPhone, Android), se COMPARTE con el menú del sistema (WhatsApp, Mail,
 * Archivos): en iOS una descarga por enlace suele no hacer nada. Si el navegador
 * pide un toque nuevo para compartir (la descarga tardó), el archivo queda listo
 * y el botón lo comparte al instante en el próximo toque. Sin soporte: descarga.
 */
@Injectable({ providedIn: 'root' })
export class ProExportsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_URL);
  private readonly doc = inject(DOCUMENT);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);
  readonly busy = signal(false);
  /** PDF ya bajado que espera un toque para compartirse (id del presupuesto). */
  readonly readyToShare = signal<string | null>(null);
  private ready: { id: string; file: File } | null = null;

  /** ¿Este dispositivo comparte archivos con el menú del sistema? Solo táctil: en escritorio, descarga. */
  canShareFiles(): boolean {
    const win = this.doc.defaultView;
    const nav = win?.navigator as (Navigator & { canShare?: (d: ShareData) => boolean }) | undefined;
    if (!win || !nav?.share || !nav.canShare || !win.matchMedia?.('(pointer: coarse)').matches) return false;
    try {
      return nav.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] });
    } catch {
      return false;
    }
  }

  async quote(id: string): Promise<QuotePdfResult> {
    const name = quotePdfName(id, this.auth.displayName());
    if (this.ready?.id === id) return this.share(this.ready.file);
    if (this.busy()) return 'error';
    const blob = await this.fetch(`/pro/quotes/${encodeURIComponent(id)}/pdf`);
    if (!blob) return 'error';
    if (!this.canShareFiles()) {
      this.save(blob, name);
      return 'downloaded';
    }
    const file = new File([blob], name, { type: 'application/pdf' });
    const result = await this.share(file);
    if (result === 'needs-tap') {
      this.ready = { id, file };
      this.readyToShare.set(id);
    }
    return result;
  }

  async month(year: number, month: number): Promise<void> {
    const blob = await this.fetch('/pro/analytics/month/export', new HttpParams().set('year', year).set('month', month));
    if (blob) this.save(blob, `resuelve-${year}-${String(month).padStart(2, '0')}.csv`);
  }

  private async share(file: File): Promise<QuotePdfResult> {
    const nav = this.doc.defaultView!.navigator;
    try {
      await nav.share({ files: [file], title: file.name.replace(/\.pdf$/, '') });
      this.clearReady();
      return 'shared';
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') {
        this.clearReady();
        return 'cancelled';
      }
      // Sin el toque reciente que exige el navegador: queda listo para el próximo toque.
      if (name === 'NotAllowedError') return 'needs-tap';
      this.clearReady();
      this.save(file, file.name);
      return 'downloaded';
    }
  }

  private clearReady() {
    this.ready = null;
    this.readyToShare.set(null);
  }

  private async fetch(path: string, params?: HttpParams): Promise<Blob | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    try {
      return await firstValueFrom(this.http.get(this.base + path, { responseType: 'blob', params }));
    } catch {
      this.toast.show('No pudimos descargar el archivo. Revisá tu conexión y que PRO siga activo.', 3500, 'info');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  private save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = this.doc.createElement('a');
    link.href = url;
    link.download = name;
    this.doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
