import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, finalize, firstValueFrom, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { classifyError } from '../api/api-error';
import { AuthApiService } from '../api/auth-api.service';
import { safeReturnUrl } from '../auth/return-url';
import { RefreshTokenStorage } from '../auth/session-storage';
import { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '../models/auth';
import { CurrentRoute } from '../services/current-route.service';
import { ToastService } from '../services/toast.service';

export type AuthAction = 'login' | 'register';

/**
 * `initializing` NO equivale a invitado: todavía no se sabe si hay sesión
 * (restauración en curso, o SSR/prerender, donde queda así para siempre).
 */
export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

/**
 * El backend rechazó la sesión (401: refresh token vencido, revocado o
 * reusado fuera de la ventana de gracia). Es lo ÚNICO que borra el refresh
 * token. Un status 0 (la recarga cortó la request, sin red), un 5xx o un
 * timeout no dicen nada de la sesión: borrarla ahí era lo que deslogueaba
 * con F5 repetido (el `error` de la request abortada corría durante la
 * descarga de la página y vaciaba sessionStorage).
 */
export function sessionRejected(error: unknown): boolean {
  return classifyError(error).kind === 'unauthorized';
}

/** Error listo para mostrar en un formulario (nunca el mensaje técnico del backend). */
export interface AuthFormError {
  message: string;
  /** Campos a marcar en el formulario (p. ej. ['email'] si ya está registrado). */
  fields: string[];
}

export const AUTH_MESSAGES = {
  invalidCredentials: 'Email o contraseña incorrectos.',
  rateLimited: 'Demasiados intentos. Esperá un momento e intentá de nuevo.',
  loginFailed: 'No pudimos iniciar sesión. Intentá nuevamente.',
  registerFailed: 'No pudimos crear tu cuenta. Intentá nuevamente.',
  emailTaken: 'Ya existe una cuenta con ese email.',
  invalidData: 'Revisá los datos ingresados.',
  sessionExpired: 'Tu sesión venció. Ingresá de nuevo.',
  loggedOut: 'Cerraste sesión.',
} as const;

/** Traduce un error de login/register a un mensaje humano. */
export function authErrorFor(error: unknown, action: AuthAction): AuthFormError {
  const e = classifyError(error);
  const failed = action === 'login' ? AUTH_MESSAGES.loginFailed : AUTH_MESSAGES.registerFailed;
  switch (e.kind) {
    case 'rate-limited':
      return { message: AUTH_MESSAGES.rateLimited, fields: [] };
    case 'unauthorized':
      return { message: action === 'login' ? AUTH_MESSAGES.invalidCredentials : failed, fields: [] };
    case 'conflict':
      return e.code === 'EMAIL_ALREADY_REGISTERED'
        ? { message: AUTH_MESSAGES.emailTaken, fields: ['email'] }
        : { message: failed, fields: [] };
    case 'validation':
      return { message: AUTH_MESSAGES.invalidData, fields: e.fields };
    default:
      return { message: failed, fields: [] };
  }
}

/**
 * Identidad del usuario (signals).
 *
 * Transporte de tokens (TRANSITORIO, ver README → "Auth"):
 * - access token: solo en memoria (este store). Nunca se persiste.
 * - refresh token: sessionStorage (RefreshTokenStorage).
 * TODO producción final: refresh token en cookie HttpOnly + Secure con dominios propios same-site.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApiService);
  private readonly storage = inject(RefreshTokenStorage);
  private readonly router = inject(Router);
  private readonly route = inject(CurrentRoute);
  private readonly toast = inject(ToastService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _accessToken = signal<string | null>(null);
  readonly user = this._user.asReadonly();
  readonly accessToken = this._accessToken.asReadonly();
  readonly authenticated = computed(() => !!this._user() && !!this._accessToken());
  /** true hasta saber si hay una sesión para restaurar (en SSR queda en true). */
  private readonly _initializing = signal(true);
  readonly initializing = this._initializing.asReadonly();
  readonly status = computed<AuthStatus>(() =>
    this._initializing() ? 'initializing' : this.authenticated() ? 'authenticated' : 'unauthenticated',
  );
  /** Login/registro en curso. */
  readonly loading = signal(false);
  readonly error = signal<AuthFormError | null>(null);

  readonly displayName = computed(() => {
    const u = this._user();
    return u ? `${u.firstName} ${u.lastName}`.trim() : '';
  });
  readonly initials = computed(() => {
    const u = this._user();
    return u ? `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase() : '';
  });

  private started = false;
  /** Refresh en vuelo: todos los que lo necesiten esperan el mismo. */
  private refreshing: Observable<string> | null = null;
  private resolveReady!: () => void;
  private readonly ready = new Promise<void>((resolve) => (this.resolveReady = resolve));

  /**
   * Restaura la sesión desde sessionStorage (solo en el navegador). Corre
   * una sola vez por carga (la llama App); guards y pantallas esperan
   * `whenReady()`, nunca disparan su propio refresh.
   */
  initialize(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    if (!this.storage.read()) {
      this.finishInitializing();
      return;
    }
    this.refresh()
      .pipe(switchMap(() => this.api.me()))
      .subscribe({
        next: (user) => {
          this._user.set(user);
          this.finishInitializing();
        },
        error: (error: unknown) => {
          // Sesión rechazada → se borra. Request cortada por la recarga o backend caído →
          // sin sesión en esta carga, pero el refresh token queda para la próxima.
          if (sessionRejected(error)) this.clearSession();
          else this._accessToken.set(null);
          this.finishInitializing();
        },
      });
  }

  /** Resuelve cuando termina `initialize()` (nunca en SSR). */
  whenReady(): Promise<void> {
    return this.ready;
  }

  hasRefreshToken(): boolean {
    return !!this.storage.read();
  }

  async login(body: LoginRequest): Promise<boolean> {
    return this.authenticate('login', () => this.api.login(body));
  }

  /** El backend devuelve tokens al registrar: queda con la sesión iniciada. */
  async register(body: RegisterRequest): Promise<boolean> {
    return this.authenticate('register', () => this.api.register(body));
  }

  /**
   * Rota el refresh token y devuelve el access token nuevo. Si ya hay un
   * refresh en curso, devuelve ese mismo (nunca dos a la vez: el backend
   * trata el reuso de un refresh token rotado como robo).
   */
  refresh(): Observable<string> {
    if (this.refreshing) return this.refreshing;
    const refreshToken = this.storage.read();
    if (!refreshToken) return throwError(() => new Error('Sin sesión para renovar'));
    this.refreshing = this.api.refresh({ refreshToken }).pipe(
      tap((tokens) => this.setTokens(tokens)),
      map((tokens) => tokens.accessToken),
      finalize(() => (this.refreshing = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing;
  }

  async loadMe(): Promise<AuthUser> {
    const user = await firstValueFrom(this.api.me());
    this._user.set(user);
    return user;
  }

  /** Idempotente. Limpia local aunque el backend falle y vuelve al inicio. */
  logout(): void {
    const refreshToken = this.storage.read();
    const hadSession = !!refreshToken || !!this._user();
    this.clearSession();
    if (refreshToken) this.api.logout({ refreshToken }).subscribe({ error: () => undefined });
    this.router.navigateByUrl('/');
    if (hadSession) this.toast.show(AUTH_MESSAGES.loggedOut);
  }

  /**
   * El backend rechazó la sesión (lo llama el interceptor ante un 401 del
   * refresh). Cierra la sesión local una sola vez y manda a ingresar solo
   * si la pantalla actual es personal, con un returnUrl interno.
   */
  sessionExpired(): void {
    if (!this._user() && !this._accessToken() && !this.storage.read()) return;
    const wasAuthenticated = !!this._user();
    this.clearSession();
    if (!wasAuthenticated) return;
    this.toast.show(AUTH_MESSAGES.sessionExpired, 3600, 'info');
    if (this.route.data()['requiresAuth']) {
      const returnUrl = safeReturnUrl(this.router.url);
      this.router.navigate(['/ingresar'], { queryParams: returnUrl ? { returnUrl } : {} });
    }
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
    this.storage.clear();
  }

  private async authenticate(action: AuthAction, call: () => Observable<AuthResponse>): Promise<boolean> {
    if (this.loading()) return false; // evita doble submit
    this.loading.set(true);
    this.error.set(null);
    let gotTokens = false;
    try {
      this.setTokens(await firstValueFrom(call()));
      gotTokens = true;
      await this.loadMe();
      this.finishInitializing();
      return true;
    } catch (error) {
      if (gotTokens) this.clearSession();
      this.error.set(authErrorFor(error, action));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  private setTokens(tokens: AuthResponse): void {
    this._accessToken.set(tokens.accessToken);
    this.storage.write(tokens.refreshToken);
  }

  private finishInitializing(): void {
    this._initializing.set(false);
    this.resolveReady();
  }
}
