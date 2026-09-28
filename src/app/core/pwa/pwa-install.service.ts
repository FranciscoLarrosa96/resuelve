import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { CurrentRoute } from '../services/current-route.service';
import { AuthStore } from '../state/auth.store';

/** `beforeinstallprompt` de Chromium (no está en los tipos del DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * - chromium: Chrome/Edge/Samsung con `beforeinstallprompt` → prompt nativo.
 * - ios: iPhone/iPad (cualquier navegador) → instrucciones de "Agregar a inicio".
 * - mac-safari: Safari de macOS 17+ → instrucciones de "Agregar al Dock".
 * - other: sin instalación posible (Firefox desktop, etc.).
 */
export type InstallPlatform = 'chromium' | 'ios' | 'mac-safari' | 'other';

export const PWA_DISMISSED_KEY = 'resuelve-pwa-install-dismissed-at';
export const PWA_VISITS_KEY = 'resuelve-pwa-visits';
export const PWA_ENGAGED_KEY = 'resuelve-pwa-engaged';
const VISIT_COUNTED_KEY = 'resuelve-pwa-visit-counted';
/** "Ahora no" (o cerrar el prompt nativo) silencia la sugerencia por 7 días. */
export const PWA_DISMISS_DAYS = 7;
/** Nada de sugerencias al abrir la app ni recién ingresado. */
const QUIET_AFTER_START_MS = 20_000;
const QUIET_AFTER_LOGIN_MS = 60_000;

/** Pantallas donde nunca se sugiere: formularios, checkout de Mercado Pago, auth y admin. */
const QUIET_ROUTES = [
  '/solicitud',
  '/urgencias',
  '/ingresar',
  '/registro',
  '/verificar-email',
  '/soy-profesional',
  '/pro/plan',
  '/admin',
];
/** Momentos con uso real: pedido creado o Agenda. */
const ENGAGED_ROUTES = ['/presupuesto/enviado', '/pro/agenda'];

export function detectPlatform(ua: string, maxTouchPoints = 0): Exclude<InstallPlatform, 'chromium'> {
  const iPadOs = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOs) return 'ios';
  if (/Macintosh/.test(ua) && /Version\/\d+.*Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) {
    const major = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return major >= 17 ? 'mac-safari' : 'other';
  }
  return 'other';
}

/**
 * Instalación de Resuelve como PWA. Única fuente de "¿se puede instalar?":
 * captura `beforeinstallprompt` (sin mostrar nada al cargar), detecta si ya
 * está instalada (`display-mode: standalone` / `navigator.standalone`) y la
 * plataforma, lanza el prompt nativo o las instrucciones de iOS/macOS y decide
 * cuándo sugerirlo (uso real, nunca en formularios, checkout ni recién
 * ingresado; "Ahora no" = 7 días). No hay sistema interno de eventos para
 * esto: el resultado solo se guarda en el dispositivo.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstall {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly window = this.browser ? this.document.defaultView : null;
  private readonly route = inject(CurrentRoute);
  private readonly auth = inject(AuthStore);

  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly fallbackPlatform = this.window
    ? detectPlatform(this.window.navigator.userAgent, this.window.navigator.maxTouchPoints ?? 0)
    : 'other';

  readonly installed = signal(this.readInstalled());
  readonly platform = computed<InstallPlatform>(() => (this.deferred() ? 'chromium' : this.fallbackPlatform));
  /** El menú de cuenta muestra "Instalar Resuelve" solo si esto es true. */
  readonly canInstall = computed(() => !this.installed() && this.platform() !== 'other');
  /** Instrucciones de iOS/macOS abiertas (no hay prompt nativo que disparar). */
  readonly instructionsOpen = signal(false);

  private readonly dismissedAt = signal(this.readNumber(PWA_DISMISSED_KEY, 'local'));
  private readonly engaged = signal(this.readNumber(PWA_ENGAGED_KEY, 'local') > 0);
  private readonly visits = signal(this.countVisit());
  private readonly quiet = signal(true);
  private quietTimer?: ReturnType<typeof setTimeout>;

  /** Sugerencia contextual (banner): con uso real, fuera de formularios y sin descartar. */
  readonly suggest = computed(() => {
    if (!this.canInstall() || this.quiet() || this.instructionsOpen()) return false;
    if (Date.now() - this.dismissedAt() < PWA_DISMISS_DAYS * 86_400_000) return false;
    if (!this.engaged() && this.visits() < 2) return false;
    this.route.url();
    return !this.route.matches(...QUIET_ROUTES) && !this.isQuoteForm();
  });

  constructor() {
    const win = this.window;
    if (!win) return;
    const onPrompt = (e: Event) => {
      // Sin mini-infobar automática: el prompt se muestra solo cuando la persona toca "Instalar".
      e.preventDefault();
      this.deferred.set(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      this.installed.set(true);
      this.deferred.set(null);
    };
    const standalone = win.matchMedia?.('(display-mode: standalone)');
    const onDisplayMode = () => this.installed.set(this.readInstalled());
    win.addEventListener('beforeinstallprompt', onPrompt);
    win.addEventListener('appinstalled', onInstalled);
    standalone?.addEventListener?.('change', onDisplayMode);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('beforeinstallprompt', onPrompt);
      win.removeEventListener('appinstalled', onInstalled);
      standalone?.removeEventListener?.('change', onDisplayMode);
      clearTimeout(this.quietTimer);
    });

    this.quietFor(QUIET_AFTER_START_MS);
    // Recién ingresado: la sugerencia espera (el login no es el momento).
    let wasGuest = false;
    effect(() => {
      const status = this.auth.status();
      untracked(() => {
        if (status === 'unauthenticated') wasGuest = true;
        else if (status === 'authenticated' && wasGuest) {
          wasGuest = false;
          this.quietFor(QUIET_AFTER_LOGIN_MS);
        }
      });
    });
    effect(() => {
      this.route.url();
      untracked(() => {
        if (this.route.matches(...ENGAGED_ROUTES)) this.markEngaged();
      });
    });
  }

  /** "Instalar Resuelve": prompt nativo (Chromium) o instrucciones (iOS / Safari de macOS). */
  async install(): Promise<'accepted' | 'dismissed' | 'instructions' | 'unavailable'> {
    const event = this.deferred();
    if (event) {
      // El evento sirve una sola vez.
      this.deferred.set(null);
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === 'accepted') this.installed.set(true);
        else this.dismiss();
        return outcome;
      } catch {
        return 'unavailable';
      }
    }
    if (this.fallbackPlatform !== 'other' && !this.installed()) {
      this.instructionsOpen.set(true);
      return 'instructions';
    }
    return 'unavailable';
  }

  /** "Ahora no": no se vuelve a sugerir por 7 días (el menú de cuenta sigue ofreciéndolo). */
  dismiss(): void {
    const now = Date.now();
    this.dismissedAt.set(now);
    this.write(PWA_DISMISSED_KEY, String(now), 'local');
  }

  closeInstructions(): void {
    this.instructionsOpen.set(false);
  }

  markEngaged(): void {
    if (this.engaged()) return;
    this.engaged.set(true);
    this.write(PWA_ENGAGED_KEY, '1', 'local');
  }

  private isQuoteForm(): boolean {
    const path = this.route.url().split(/[?#]/)[0];
    return (path === '/presupuesto') || /^\/pro\/solicitudes\/[^/]+\/presupuesto$/.test(path);
  }

  private quietFor(ms: number): void {
    clearTimeout(this.quietTimer);
    this.quiet.set(true);
    this.quietTimer = setTimeout(() => this.quiet.set(false), ms);
  }

  private readInstalled(): boolean {
    const win = this.window;
    if (!win) return false;
    const nav = win.navigator as Navigator & { standalone?: boolean };
    return !!win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  }

  /** Una visita por sesión del navegador (la sugerencia espera a la segunda). */
  private countVisit(): number {
    const visits = this.readNumber(PWA_VISITS_KEY, 'local');
    if (!this.window || this.readNumber(VISIT_COUNTED_KEY, 'session')) return visits;
    this.write(VISIT_COUNTED_KEY, '1', 'session');
    this.write(PWA_VISITS_KEY, String(visits + 1), 'local');
    return visits + 1;
  }

  private readNumber(key: string, area: 'local' | 'session'): number {
    try {
      const raw = (area === 'local' ? this.window?.localStorage : this.window?.sessionStorage)?.getItem(key);
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  private write(key: string, value: string, area: 'local' | 'session'): void {
    try {
      (area === 'local' ? this.window?.localStorage : this.window?.sessionStorage)?.setItem(key, value);
    } catch {
      // Sin storage: vale para esta pestaña.
    }
  }
}
