import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';

/** Contexto de una aparición en resultados (sin texto libre ni dirección). */
export interface ImpressionContext {
  professionalId: string;
  serviceId: string | null;
  zoneId: string | null;
  /** Búsqueda con "Disponible hoy". */
  isUrgent: boolean;
  isFeaturedPlacement: boolean;
  /** Página de resultados en la que apareció (1 = primera). */
  page: number;
}

type ExposureEvent =
  | ({ type: 'SEARCH_IMPRESSION' } & Omit<ImpressionContext, 'serviceId' | 'zoneId'> & { serviceId?: string; zoneId?: string })
  | { type: 'PROFILE_VIEW'; professionalId: string };

const SESSION_KEY = 'resuelve.exposureSession';
const VIEWS_KEY = 'resuelve.profileViews';
export const FLUSH_DELAY_MS = 2000;
export const MAX_BATCH = 50;
export const PROFILE_VIEW_WINDOW_MS = 30 * 60 * 1000;

export const impressionKey = (c: ImpressionContext): string =>
  [c.professionalId, c.serviceId ?? '', c.zoneId ?? '', c.isUrgent, c.page].join('|');

/**
 * Exposición real para "Tu mes" PRO: apariciones en búsquedas y visitas al
 * perfil. Anónimo: una clave aleatoria por pestaña (sessionStorage), nunca
 * email, teléfono ni nombre. Agrupa en tandas (cada ~2 s, hasta 50) y
 * deduplica acá y en el backend: un rerender o volver a la misma búsqueda no
 * suma. La exposición propia no se envía. Solo navegador; errores silenciosos.
 */
@Injectable({ providedIn: 'root' })
export class ExposureTracker {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);
  private readonly auth = inject(AuthStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly seen = new Set<string>();
  private queue: ExposureEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private memorySession: string | null = null;

  constructor() {
    if (!this.browser) return;
    // Al irse de la página se manda lo pendiente (keepalive sobrevive a la navegación).
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    });
  }

  /** La tarjeta estuvo visible el tiempo suficiente (lo decide la directiva). */
  impression(c: ImpressionContext): void {
    if (!this.browser || this.isSelf(c.professionalId)) return;
    const key = `imp|${impressionKey(c)}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.enqueue({
      type: 'SEARCH_IMPRESSION',
      professionalId: c.professionalId,
      ...(c.serviceId ? { serviceId: c.serviceId } : {}),
      ...(c.zoneId ? { zoneId: c.zoneId } : {}),
      isUrgent: c.isUrgent,
      isFeaturedPlacement: c.isFeaturedPlacement,
      page: c.page,
    });
  }

  /** Apertura del perfil público: una por pestaña cada 30 min (F5 no suma). */
  profileView(professionalId: string, now = Date.now()): void {
    if (!this.browser || this.isSelf(professionalId)) return;
    const views = this.readViews();
    if (now - (views[professionalId] ?? 0) < PROFILE_VIEW_WINDOW_MS) return;
    views[professionalId] = now;
    this.writeViews(views);
    this.enqueue({ type: 'PROFILE_VIEW', professionalId });
  }

  /** Envía lo pendiente. `leaving` = la página se oculta: fetch keepalive. */
  flush(leaving = false): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.queue.length) {
      const events = this.queue.splice(0, MAX_BATCH);
      const body = { sessionKey: this.sessionKey(), events };
      const url = `${this.baseUrl}/analytics/events`;
      if (leaving && typeof fetch === 'function') {
        void fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => undefined);
      } else {
        this.http.post(url, body).subscribe({ error: () => undefined });
      }
    }
  }

  private enqueue(e: ExposureEvent): void {
    this.queue.push(e);
    if (this.queue.length >= MAX_BATCH) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), FLUSH_DELAY_MS);
  }

  private isSelf(professionalId: string): boolean {
    return this.auth.user()?.professionalProfileId === professionalId;
  }

  private sessionKey(): string {
    try {
      let key = sessionStorage.getItem(SESSION_KEY);
      if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
        key = randomKey();
        sessionStorage.setItem(SESSION_KEY, key);
      }
      return key;
    } catch {
      return (this.memorySession ??= randomKey());
    }
  }

  private readViews(): Record<string, number> {
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(VIEWS_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  private writeViews(views: Record<string, number>): void {
    try {
      sessionStorage.setItem(VIEWS_KEY, JSON.stringify(views));
    } catch {
      /* sin almacenamiento: el backend deduplica igual */
    }
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
