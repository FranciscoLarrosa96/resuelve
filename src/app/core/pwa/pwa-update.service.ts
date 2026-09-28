import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { onTabVisible } from '../utils/on-tab-visible';

const RELOADED_AT_KEY = 'resuelve-sw-reloaded-at';
/** Si la app se recargó por una actualización hace menos que esto, no se recarga de nuevo (sin loops). */
const RELOAD_GUARD_MS = 15_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Nueva versión de Resuelve (service worker de Angular). Nunca recarga sola:
 * avisa "Hay una nueva versión" y recarga solo cuando la persona toca
 * "Actualizar" (así no se pierde un formulario a medio llenar; el borrador del
 * pedido además vive en sessionStorage). Sin service worker (dev, tests, SSR)
 * no hace nada.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdate {
  private readonly sw = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly available = signal(false);
  readonly applying = signal(false);

  constructor() {
    const sw = this.sw;
    if (!this.browser || !sw?.isEnabled) return;
    sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.available.set(!this.recentlyReloaded()));
    // Versión en caché rota (p. ej. borrada por el navegador): hace falta recargar.
    sw.unrecoverable.subscribe(() => this.available.set(!this.recentlyReloaded()));
    // Una app instalada puede quedar abierta días: se revisa al volver, como mucho una vez por hora.
    onTabVisible(() => void sw.checkForUpdate().catch(() => undefined), CHECK_INTERVAL_MS);
  }

  async apply(): Promise<void> {
    if (this.applying()) return;
    this.applying.set(true);
    try {
      await this.sw?.activateUpdate();
    } catch {
      // Igual se recarga: el navegador trae la versión nueva.
    }
    try {
      this.document.defaultView?.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    } catch {
      // Sin storage: sin guarda extra.
    }
    this.document.defaultView?.location.reload();
  }

  dismiss(): void {
    this.available.set(false);
  }

  private recentlyReloaded(): boolean {
    try {
      const at = Number(this.document.defaultView?.sessionStorage.getItem(RELOADED_AT_KEY));
      return Number.isFinite(at) && Date.now() - at < RELOAD_GUARD_MS;
    } catch {
      return false;
    }
  }
}
