import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, defer, finalize, firstValueFrom, map, shareReplay, switchMap, throwError } from 'rxjs';
import { classifyError } from '../api/api-error';
import { AuthApiService } from '../api/auth-api.service';
import { afterLoginUrl, safeReturnUrl } from '../auth/return-url';
import { RefreshTokenStorage } from '../auth/session-storage';
import { AuthResponse, AuthUser, LoginRequest, RegisterRequest, isPendingRegistration } from '../models/auth';
import { CurrentRoute } from '../services/current-route.service';
import { ToastService } from '../services/toast.service';
import { RegistrationVerificationStore } from './registration-verification.store';

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
 * descarga de la página y vaciaba el almacenamiento).
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
  endedElsewhere: 'Tu sesión se cerró en otra pestaña.',
  loggedOut: 'Cerraste sesión.',
  accountDeleted: 'Eliminamos tu cuenta. Gracias por haber usado Resuelve.',
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
 * - refresh token: localStorage (RefreshTokenStorage), compartido entre pestañas.
 * TODO producción final: refresh token en cookie HttpOnly + Secure con dominios propios same-site.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApiService);
  private readonly storage = inject(RefreshTokenStorage);
  private readonly router = inject(Router);
  private readonly route = inject(CurrentRoute);
  private readonly toast = inject(ToastService);
  private readonly pendingRegistration = inject(RegistrationVerificationStore);
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

  /** Cambió la preferencia de avisos por email (Mi perfil). */
  setEmailNotifications(emailNotifications: boolean): void {
    this._user.update((u) => (u ? { ...u, emailNotifications } : u));
  }

  /** La foto de perfil cambió (subir/eliminar): header y menú se actualizan sin F5. */
  setAvatarUrl(avatarUrl: string | null): void {
    this._user.update((u) => (u ? { ...u, avatarUrl } : u));
  }

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
   * Restaura la sesión guardada (solo en el navegador). Corre una sola vez
   * por carga (la llama App); guards y pantallas esperan `whenReady()`,
   * nunca disparan su propio refresh. Desde acá también se siguen los
   * ingresos y cierres de sesión de las otras pestañas.
   */
  initialize(): void {
    if (this.started || !this.browser) return;
    this.started = true;
    this.storage.onChangeElsewhere((token) => this.syncWithOtherTab(token));
    if (!this.storage.read()) {
      this.finishInitializing();
      return;
    }
    this.restore();
  }

  /** `fromOtherTab`: otra pestaña ingresó; si esta está en ingresar/registro, sigue al destino. */
  private restore(fromOtherTab = false): void {
    this._initializing.set(true);
    this.refresh()
      .pipe(switchMap(() => this.api.me()))
      .subscribe({
        next: (user) => {
          this._user.set(user);
          this.finishInitializing();
          if (fromOtherTab) this.leaveGuestScreen(user);
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

  /**
   * Hoy el backend crea la cuenta y devuelve tokens: queda la sesión iniciada,
   * igual que `login`. Si la verificación de email está encendida en el
   * backend, solo abre un registro pendiente (sin sesión) y recién
   * `completeExternalAuth`, después de `/verificar-email`, inicia la sesión.
   */
  async register(body: RegisterRequest): Promise<boolean> {
    if (this.loading()) return false;
    this.loading.set(true);
    this.error.set(null);
    let gotTokens = false;
    try {
      const res = await firstValueFrom(this.api.register(body));
      if (isPendingRegistration(res)) {
        this.pendingRegistration.start(res.verificationSessionId, res.maskedEmail);
        return true;
      }
      this.setTokens(res);
      gotTokens = true;
      await this.loadMe();
      this.finishInitializing();
      return true;
    } catch (error) {
      if (gotTokens) this.clearSession();
      this.error.set(authErrorFor(error, 'register'));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deja la sesión iniciada con tokens que NO vinieron de `login`/`refresh`
   * (hoy, solo tras verificar un registro pendiente). Mismo efecto que
   * `authenticate()`, sin volver a llamar a la API.
   */
  async completeExternalAuth(tokens: AuthResponse): Promise<AuthUser> {
    this.setTokens(tokens);
    const user = await this.loadMe();
    this.finishInitializing();
    return user;
  }

  /**
   * Rota el refresh token y devuelve el access token nuevo. Si ya hay un
   * refresh en curso, devuelve ese mismo (nunca dos a la vez: el backend
   * trata el reuso de un refresh token rotado como robo). Entre pestañas
   * se serializan con un lock: cada una lee el token recién dentro del lock,
   * así usa el que dejó la anterior.
   */
  refresh(): Observable<string> {
    if (this.refreshing) return this.refreshing;
    if (!this.storage.read()) return throwError(() => new Error('Sin sesión para renovar'));
    this.refreshing = defer(() => this.storage.withLock(() => this.rotate())).pipe(
      finalize(() => (this.refreshing = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing;
  }

  private rotate(): Observable<string> {
    const refreshToken = this.storage.read();
    if (!refreshToken) return throwError(() => new Error('Sin sesión para renovar'));
    return this.api.refresh({ refreshToken }).pipe(
      map((tokens) => {
        if (this.storage.read() !== refreshToken) {
          // Otra pestaña cerró (o cambió) la sesión mientras viajaba: el token nuevo
          // no se guarda, se revoca, y esta pestaña se entera por el evento `storage`.
          this.api.logout({ refreshToken: tokens.refreshToken }).subscribe({ error: () => undefined });
          throw new Error('La sesión cambió en otra pestaña');
        }
        this.setTokens(tokens);
        return tokens.accessToken;
      }),
    );
  }

  async loadMe(): Promise<AuthUser> {
    const user = await firstValueFrom(this.api.me());
    this._user.set(user);
    return user;
  }

  /** true si hay sesión pero todavía no demostró que controla el email (nunca confundir con invitado). */
  readonly emailUnverified = computed(() => this.authenticated() && !this._user()?.emailVerified);

  sendEmailVerification(): Observable<void> {
    return this.api.sendEmailVerification();
  }

  async verifyEmailCode(code: string): Promise<void> {
    const { emailVerifiedAt } = await firstValueFrom(this.api.verifyEmail(code));
    this._user.update((u) => (u ? { ...u, emailVerified: true, emailVerifiedAt } : u));
  }

  async changeEmailBeforeVerification(email: string, password: string): Promise<void> {
    await firstValueFrom(this.api.changeEmail(email, password));
    this._user.update((u) => (u ? { ...u, email, emailVerified: false, emailVerifiedAt: null } : u));
  }

  private readonly endHooks: ((reason: 'logout' | 'deleted') => void)[] = [];

  /**
   * Algo que tiene que pasar con la sesión todavía viva, justo antes de
   * cerrarla (p. ej. dar de baja el push de este dispositivo). Sin inyectar
   * nada en AuthStore: evita dependencias circulares.
   */
  onBeforeSessionEnd(hook: (reason: 'logout' | 'deleted') => void): void {
    this.endHooks.push(hook);
  }

  private runEndHooks(reason: 'logout' | 'deleted'): void {
    for (const hook of this.endHooks) {
      try {
        hook(reason);
      } catch {
        // Un hook que falla nunca impide cerrar la sesión.
      }
    }
  }

  /** Idempotente. Limpia local aunque el backend falle y vuelve al inicio. */
  logout(): void {
    const refreshToken = this.storage.read();
    const hadSession = !!refreshToken || !!this._user();
    if (hadSession) this.runEndHooks('logout');
    this.clearSession();
    // Con el lock: si otra pestaña está rotando este token, primero termina (y ve que la sesión se cerró).
    if (refreshToken)
      this.storage.withLock(() => this.api.logout({ refreshToken })).subscribe({ error: () => undefined });
    this.router.navigateByUrl('/');
    if (hadSession) this.toast.show(AUTH_MESSAGES.loggedOut);
  }

  /** El backend ya anonimizó la cuenta: se cierra la sesión local (sin llamar a logout, los tokens ya no existen). */
  accountDeleted(): void {
    this.runEndHooks('deleted');
    this.clearSession();
    this.router.navigateByUrl('/');
    this.toast.show(AUTH_MESSAGES.accountDeleted, 4200, 'info');
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
    if (wasAuthenticated) this.leavePersonalScreen(AUTH_MESSAGES.sessionExpired);
  }

  /**
   * Otra pestaña ingresó, cerró la sesión o la rotó. `token` es el refresh
   * token que dejó (`null` = ya no hay sesión). Rotar no cambia nada acá:
   * cada pestaña tiene su access token y el próximo refresh lee el nuevo.
   */
  private syncWithOtherTab(token: string | null): void {
    if (this._initializing()) return; // la restauración en curso lee el token dentro del lock
    if (!token) {
      if (!this._user() && !this._accessToken()) return;
      const wasAuthenticated = !!this._user();
      // Solo memoria: el almacenamiento ya lo limpió la otra pestaña (y puede tener una sesión nueva).
      this._accessToken.set(null);
      this._user.set(null);
      if (wasAuthenticated) this.leavePersonalScreen(AUTH_MESSAGES.endedElsewhere);
      return;
    }
    if (!this.authenticated()) this.restore(true);
  }

  private leaveGuestScreen(user: AuthUser): void {
    const url = this.router.parseUrl(this.router.url);
    const path = url.root.children['primary']?.segments[0]?.path;
    if (path === 'ingresar' || path === 'registro')
      this.router.navigateByUrl(afterLoginUrl(url.queryParamMap.get('returnUrl'), user));
  }

  private leavePersonalScreen(message: string): void {
    this.toast.show(message, 3600, 'info');
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
    // Una sesión real reemplaza a cualquier registro pendiente abandonado (otro email).
    this.pendingRegistration.clear();
    this._accessToken.set(tokens.accessToken);
    this.storage.write(tokens.refreshToken);
  }

  private finishInitializing(): void {
    this._initializing.set(false);
    this.resolveReady();
  }
}
