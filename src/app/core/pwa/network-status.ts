import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

/** Evento que dispara "Reintentar": las pantallas abiertas se releen (ver `onTabVisible`). */
export const RETRY_EVENT = 'resuelve:retry';

/**
 * Conexión del dispositivo (`navigator.onLine` + eventos online/offline).
 * Sin red, la app muestra "Sin conexión" en vez de errores técnicos; los
 * datos no se inventan ni se sirven de una caché: se releen al volver.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatus {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly window = this.browser ? this.document.defaultView : null;

  /** En SSR/prerender siempre true (no hay banner en el HTML estático). */
  readonly online = signal(this.window ? this.window.navigator.onLine !== false : true);

  constructor() {
    const win = this.window;
    if (!win) return;
    const update = () => this.online.set(win.navigator.onLine !== false);
    win.addEventListener('online', update);
    win.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', update);
      win.removeEventListener('offline', update);
    });
  }

  /** "Reintentar": si volvió la red, las pantallas abiertas piden sus datos de nuevo. */
  retry(): boolean {
    const online = this.window?.navigator.onLine !== false;
    this.online.set(online);
    if (online) this.document.dispatchEvent(new Event(RETRY_EVENT));
    return online;
  }
}
