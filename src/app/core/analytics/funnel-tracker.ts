import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_URL } from '../api/api.config';
import type { FunnelEventType, FunnelSurface } from '../models/funnel';
import { AuthStore } from '../state/auth.store';
import { FLUSH_DELAY_MS } from './exposure-tracker';

/**
 * Embudo PRO del lado del frontend: solo vistas de Mi plan y clicks en CTAs
 * de PRO (`POST /pro/funnel-events`); el resto (checkout, cobro, primer
 * éxito…) lo registra el backend en la acción real. Una vez por sesión y
 * superficie; se envía diferido (~2 s) para no competir con las requests de
 * la pantalla, y al ocultar la página con `fetch` keepalive (un click que
 * sale a Mercado Pago no se pierde). Errores silenciosos: es medición.
 */
@Injectable({ providedIn: 'root' })
export class FunnelTracker {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);
  private readonly auth = inject(AuthStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly sent = new Set<string>();
  private queue: { type: FunnelEventType; surface: FunnelSurface }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.browser) return;
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

  track(type: FunnelEventType, surface: FunnelSurface): void {
    if (!this.browser || !this.auth.user()?.professionalProfileId) return;
    const key = `${type}|${surface}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.queue.push({ type, surface });
    this.timer ??= setTimeout(() => this.flush(), FLUSH_DELAY_MS);
  }

  flush(leaving = false): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const url = `${this.baseUrl}/pro/funnel-events`;
    const token = this.auth.accessToken();
    for (const body of this.queue.splice(0)) {
      if (leaving && typeof fetch === 'function' && token) {
        void fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }).catch(() => undefined);
      } else {
        this.http.post(url, body).subscribe({ error: () => undefined });
      }
    }
  }
}
