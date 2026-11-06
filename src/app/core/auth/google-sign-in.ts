import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';

/** Lo mínimo de Google Identity Services que usamos (script oficial, sin dependencias). */
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    context?: 'signin' | 'signup' | 'use';
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Los tests unitarios no consultan /auth/providers salvo que lo pidan (`test-setup.ts`). */
let offline = false;
export function setGoogleSignInOffline(value: boolean): void {
  offline = value;
}

/**
 * «Continuar con Google» (única fuente). El backend dice si está habilitado
 * (`GET /auth/providers` → `googleClientId`); sin eso no se ofrece. El script de Google
 * se carga recién cuando una pantalla muestra el botón, nunca en el SSR. Google entrega
 * un ID token que verifica el backend: acá no se decide nada sobre la cuenta.
 */
@Injectable({ providedIn: 'root' })
export class GoogleSignIn {
  private readonly api = inject(AuthApiService);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** null = sin ingreso con Google (o todavía no se sabe). */
  readonly clientId = signal<string | null>(null);
  private loading: Promise<GoogleAccountsId | null> | null = null;

  /** Carga la configuración y el script una sola vez; null si no hay Google (o falla). */
  load(): Promise<GoogleAccountsId | null> {
    if (!this.browser || offline) return Promise.resolve(null);
    this.loading ??= this.fetch();
    return this.loading;
  }

  private async fetch(): Promise<GoogleAccountsId | null> {
    try {
      const { googleClientId } = await firstValueFrom(this.api.providers());
      if (!googleClientId) return null;
      const gis = await this.script();
      if (gis) this.clientId.set(googleClientId);
      return gis;
    } catch {
      // Sin backend o sin Google: simplemente no se ofrece el botón.
      this.loading = null;
      return null;
    }
  }

  private script(): Promise<GoogleAccountsId | null> {
    const ready = () => this.document.defaultView?.google?.accounts?.id ?? null;
    if (ready()) return Promise.resolve(ready());
    return new Promise((resolve) => {
      const tag = this.document.createElement('script');
      tag.src = GIS_SRC;
      tag.async = true;
      tag.defer = true;
      tag.onload = () => resolve(ready());
      tag.onerror = () => resolve(null);
      this.document.head.appendChild(tag);
    });
  }

  /**
   * Dibuja el botón oficial de Google dentro de `parent`. Cada botón registra su propio
   * callback (Google admite uno por página: el último que se dibuja manda).
   */
  async render(
    parent: HTMLElement,
    text: 'continue_with' | 'signup_with' | 'signin_with',
    onCredential: (credential: string) => void,
  ): Promise<boolean> {
    const gis = await this.load();
    const clientId = this.clientId();
    if (!gis || !clientId) return false;
    gis.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      context: text === 'signup_with' ? 'signup' : 'signin',
    });
    parent.replaceChildren();
    gis.renderButton(parent, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'rectangular',
      logo_alignment: 'center',
      locale: 'es-419',
      width: Math.max(220, Math.min(400, Math.round(parent.clientWidth || 320))),
    });
    return true;
  }
}
