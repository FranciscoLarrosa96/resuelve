import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, firstValueFrom, from } from 'rxjs';

export const REFRESH_TOKEN_KEY = 'resuelve.refreshToken';

/**
 * Único lugar donde se persiste algo de la sesión: el refresh token, en
 * localStorage. Lo comparten todas las pestañas y sobrevive a cerrar el
 * navegador o la app instalada (dura lo que el refresh token en el backend,
 * `JWT_REFRESH_EXPIRES_IN`, y se renueva con cada uso). El access token
 * NUNCA se persiste: vive solo en memoria (AuthStore, uno por pestaña).
 *
 * Antes estaba en sessionStorage: cada pestaña nueva pedía ingresar y
 * cerrar la app en el celular cerraba la sesión. Un token que haya quedado
 * ahí (pestañas abiertas antes del cambio) se mueve a localStorage al leerlo.
 *
 * TRANSITORIO: mientras frontend y backend estén en dominios de terceros
 * distintos. TODO producción final: migrar el refresh token a cookie
 * HttpOnly + Secure con dominios propios same-site (p. ej. resuelve.com.ar +
 * api.resuelve.com.ar). Ver README.
 *
 * En SSR/prerender no toca el almacenamiento (no existe).
 */
@Injectable({ providedIn: 'root' })
export class RefreshTokenStorage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  read(): string | null {
    if (!this.browser) return null;
    try {
      const token = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (token) return token;
      const legacy = sessionStorage.getItem(REFRESH_TOKEN_KEY);
      if (legacy) {
        localStorage.setItem(REFRESH_TOKEN_KEY, legacy);
        sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      }
      return legacy;
    } catch {
      return null; // almacenamiento bloqueado por el navegador
    }
  }

  write(token: string): void {
    if (!this.browser) return;
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la página */
    }
  }

  clear(): void {
    if (!this.browser) return;
    try {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* nada que limpiar */
    }
  }

  /**
   * Otra pestaña cambió el refresh token: `token` es el nuevo, o `null` si
   * cerró la sesión. El evento `storage` nunca llega a la pestaña que escribe.
   */
  onChangeElsewhere(listener: (token: string | null) => void): void {
    if (!this.browser) return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      // `key === null`: otra pestaña ejecutó localStorage.clear().
      if (event.key === REFRESH_TOKEN_KEY || event.key === null) listener(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
  }

  /**
   * Corre `task` con un lock compartido entre pestañas (Web Locks), para que
   * dos pestañas nunca roten el mismo refresh token a la vez: la segunda
   * espera y lee el token que dejó la primera. Sin Web Locks (navegadores
   * viejos) corre directo y el backend lo cubre con la ventana de gracia.
   */
  withLock<T>(task: () => Observable<T>): Observable<T> {
    const locks = this.browser ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (!locks?.request) return task();
    return from(locks.request('resuelve.refresh', () => firstValueFrom(task())) as Promise<T>);
  }
}
