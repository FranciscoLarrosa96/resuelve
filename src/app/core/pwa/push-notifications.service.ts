import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, take } from 'rxjs';
import { PushApiService } from '../api/push-api.service';
import { AuthStore } from '../state/auth.store';
import { PwaInstall } from './pwa-install.service';

/**
 * - loading: todavía no sabemos (sin sesión o consultando).
 * - unavailable: el servidor no manda push o este navegador no los soporta: no se ofrece.
 * - ios-install: iPhone/iPad sin la app instalada (Apple solo permite push instalada).
 * - blocked: la persona bloqueó las notificaciones en el navegador.
 * - off / on: este dispositivo no recibe / recibe los avisos de esta cuenta.
 */
export type PushState = 'loading' | 'unavailable' | 'ios-install' | 'blocked' | 'off' | 'on';

export const PUSH_DISMISSED_KEY = 'resuelve-push-dismissed-at';
/** "Ahora no" en la sugerencia del panel silencia por 7 días (como la de instalar). */
export const PUSH_DISMISS_DAYS = 7;

/**
 * Avisos push de ESTE dispositivo. Única fuente de "¿se puede / está activo?".
 * Nunca pide permiso solo: siempre por un toque de la persona. Una suscripción
 * es del navegador: al cerrar sesión se da de baja (servidor y navegador),
 * así la próxima cuenta en ese navegador no hereda nada.
 */
@Injectable({ providedIn: 'root' })
export class PushNotifications {
  private readonly api = inject(PushApiService);
  private readonly auth = inject(AuthStore);
  private readonly pwa = inject(PwaInstall);
  private readonly swPush = inject(SwPush, { optional: true });
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly window = this.browser ? inject(DOCUMENT).defaultView : null;

  /** Service worker activo + Push API + Notification API. */
  readonly supported =
    !!this.window && !!this.swPush?.isEnabled && 'PushManager' in this.window && 'Notification' in this.window;

  private readonly serverEnabled = signal<boolean | null>(null);
  private publicKey: string | null = null;
  private endpoint: string | null = null;
  readonly permission = signal<NotificationPermission | 'unsupported'>(this.readPermission());
  readonly subscribed = signal(false);
  readonly busy = signal(false);
  private readonly dismissedAt = signal<number | null>(this.readDismissed());

  readonly state = computed<PushState>(() => {
    const server = this.serverEnabled();
    if (server === null) return 'loading';
    if (!server) return 'unavailable';
    if (!this.supported) return this.pwa.platform() === 'ios' && !this.pwa.installed() ? 'ios-install' : 'unavailable';
    if (this.permission() === 'denied') return 'blocked';
    return this.subscribed() ? 'on' : 'off';
  });

  /** Sugerencia del panel: se puede activar, nunca se preguntó y no dijo "Ahora no" hace poco. */
  readonly shouldSuggest = computed(() => {
    if (this.state() !== 'off' || this.permission() !== 'default') return false;
    const at = this.dismissedAt();
    return at === null || Date.now() - at > PUSH_DISMISS_DAYS * 86_400_000;
  });

  constructor() {
    if (!this.browser) return;
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => (userId ? void this.sync() : this.reset()));
    });
    this.auth.onBeforeSessionEnd((reason) => this.forget(reason));
  }

  /** Lee si el servidor manda push y si este navegador ya está suscripto a esta cuenta. */
  async sync(): Promise<void> {
    try {
      const config = await firstValueFrom(this.api.config());
      this.publicKey = config.publicKey;
      this.permission.set(this.readPermission());
      if (config.enabled && this.supported && this.swPush) {
        const current = await firstValueFrom(this.swPush.subscription.pipe(take(1)));
        this.endpoint = current?.endpoint ?? null;
        this.subscribed.set(
          this.endpoint ? (await firstValueFrom(this.api.status(this.endpoint))).subscribed : false,
        );
      }
      this.serverEnabled.set(config.enabled && !!config.publicKey);
    } catch {
      // Sin respuesta: no se ofrece (mejor no mostrar nada que un interruptor que no anda).
      this.serverEnabled.set(false);
    }
  }

  /** Pide permiso (si hace falta) y suscribe este dispositivo. */
  async enable(): Promise<'on' | 'blocked' | 'failed'> {
    if (this.busy() || !this.swPush || !this.publicKey) return 'failed';
    this.busy.set(true);
    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: this.publicKey });
      await firstValueFrom(this.api.subscribe(sub.toJSON()));
      this.endpoint = sub.endpoint;
      this.subscribed.set(true);
      this.permission.set(this.readPermission());
      return 'on';
    } catch {
      this.permission.set(this.readPermission());
      return this.permission() === 'denied' ? 'blocked' : 'failed';
    } finally {
      this.busy.set(false);
    }
  }

  /** Deja de recibir avisos en este dispositivo (servidor y navegador). */
  async disable(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      if (this.endpoint) await firstValueFrom(this.api.remove(this.endpoint));
      await this.swPush?.unsubscribe().catch(() => undefined);
      this.endpoint = null;
      this.subscribed.set(false);
      return true;
    } catch {
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  dismissSuggestion(): void {
    const now = Date.now();
    this.dismissedAt.set(now);
    try {
      this.window?.localStorage.setItem(PUSH_DISMISSED_KEY, String(now));
    } catch {
      // Sin almacenamiento: se silencia solo por esta visita.
    }
  }

  /** Con la sesión todavía viva: baja en el servidor (al salir) y en el navegador. */
  private forget(reason: 'logout' | 'deleted'): void {
    if (reason === 'logout' && this.subscribed() && this.endpoint) {
      this.api.remove(this.endpoint).subscribe({ error: () => undefined });
    }
    if (this.endpoint) void this.swPush?.unsubscribe().catch(() => undefined);
    this.reset();
  }

  private reset(): void {
    this.serverEnabled.set(null);
    this.subscribed.set(false);
    this.endpoint = null;
    this.publicKey = null;
  }

  private readPermission(): NotificationPermission | 'unsupported' {
    return this.window && 'Notification' in this.window ? this.window.Notification.permission : 'unsupported';
  }

  private readDismissed(): number | null {
    try {
      const raw = this.window?.localStorage.getItem(PUSH_DISMISSED_KEY);
      return raw ? Number(raw) || null : null;
    } catch {
      return null;
    }
  }
}
