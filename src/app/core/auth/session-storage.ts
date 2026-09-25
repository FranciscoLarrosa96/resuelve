import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const KEY = 'resuelve.refreshToken';

/**
 * Único lugar donde se persiste algo de la sesión: el refresh token, en
 * sessionStorage (se pierde al cerrar la pestaña). El access token NUNCA
 * se persiste: vive solo en memoria (AuthStore).
 *
 * TRANSITORIO: mientras frontend (vercel.app) y backend (onrender.com)
 * estén en dominios de terceros distintos. TODO producción final: migrar
 * el refresh token a cookie HttpOnly + Secure con dominios propios
 * same-site (p. ej. resuelve.com.ar + api.resuelve.com.ar). Ver README.
 *
 * En SSR/prerender no toca sessionStorage (no existe).
 */
@Injectable({ providedIn: 'root' })
export class RefreshTokenStorage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  read(): string | null {
    if (!this.browser) return null;
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null; // almacenamiento bloqueado por el navegador
    }
  }

  write(token: string): void {
    if (!this.browser) return;
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la página */
    }
  }

  clear(): void {
    if (!this.browser) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nada que limpiar */
    }
  }
}
