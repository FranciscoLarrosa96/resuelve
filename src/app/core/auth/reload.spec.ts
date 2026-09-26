import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CanActivateFn, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { ProDashboardPage } from '../../features/pro/dashboard/pro-dashboard-page';
import { ProShell } from '../../layout/pro-shell/pro-shell';
import { API_URL } from '../api/api.config';
import { AuthResponse, AuthUser } from '../models/auth';
import { AuthStore } from '../state/auth.store';
import { ProStore } from '../state/pro.store';
import { authGuard, professionalGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';

// F5 con sesión: la sesión sobrevive y el panel nunca muestra datos de ejemplo.
// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';
const RT_KEY = 'resuelve.refreshToken';
const PRO: AuthUser = {
  id: 'u-pro', firstName: 'Mateo', lastName: 'Real', email: 'mateo@example.com', phone: null,
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: 'profile-1',
  createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens = (n: number): AuthResponse => ({
  accessToken: `access.${n}.sig`, refreshToken: `refresh.${n}.sig`, expiresIn: 900, tokenType: 'Bearer',
});
/** Lo que ve el navegador cuando una recarga corta la request (status 0). */
const aborted = new ProgressEvent('abort');
const DEMO = ['Profesional de ejemplo', '487.000', 'Pantalla de demostración', 'Tu mes'];

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'pro/perfil', component: Blank, data: { requiresAuth: true } },
        { path: '**', component: Blank },
      ]),
      { provide: API_URL, useValue: API },
    ],
  });
  return {
    auth: TestBed.inject(AuthStore),
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
  };
}

const run = (guard: CanActivateFn, url: string) =>
  TestBed.runInInjectionContext(() => guard({} as never, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;

/** Resultado de una promesa sin esperarla (para ver que el guard sigue esperando). */
function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  promise.then((value) => Object.assign(state, { done: true, value }));
  return state;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

describe('AuthStore: estados del bootstrap', () => {
  it('INITIALIZING no equivale a invitado: el guard espera y después deja pasar', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    expect(auth.status()).toBe('initializing');
    expect(auth.authenticated()).toBe(false);

    const decision = track(run(authGuard, '/perfil'));
    await flush();
    expect(decision.done).toBe(false); // todavía no decidió "invitado"

    http.expectOne(`${API}/auth/refresh`).flush(tokens(1));
    http.expectOne(`${API}/auth/me`).flush(PRO);
    await flush();
    expect(decision).toEqual({ done: true, value: true });
    expect(auth.status()).toBe('authenticated');
  });

  it('initialize corre una sola vez: un solo refresh aunque se llame varias veces', () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    auth.initialize();
    auth.refresh().subscribe();
    expect(http.match(`${API}/auth/refresh`).length).toBe(1);
  });

  it('la recarga corta el refresh (status 0): NO borra el refresh token', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    http.expectOne(`${API}/auth/refresh`).error(aborted);
    await auth.whenReady();
    expect(auth.status()).toBe('unauthenticated');
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.0.sig');
  });

  it('la recarga corta /auth/me después de rotar: queda guardado el token NUEVO', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    http.expectOne(`${API}/auth/refresh`).flush(tokens(1));
    http.expectOne(`${API}/auth/me`).error(aborted);
    await auth.whenReady();
    expect(auth.accessToken()).toBeNull();
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.1.sig');
  });

  it('backend caído (5xx) al restaurar: no borra la sesión', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    http.expectOne(`${API}/auth/refresh`).flush(null, { status: 503, statusText: 'Unavailable' });
    await auth.whenReady();
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.0.sig');
  });
});

describe('interceptor: solo un rechazo real cierra la sesión', () => {
  async function signedIn() {
    const ctx = setup();
    const done = ctx.auth.login({ email: PRO.email, password: 'una-clave-larga' });
    ctx.http.expectOne(`${API}/auth/login`).flush(tokens(1));
    await flush();
    ctx.http.expectOne(`${API}/auth/me`).flush(PRO);
    await done;
    await ctx.router.navigateByUrl('/pro/perfil');
    return ctx;
  }

  it('refresh cortado por la recarga: no cierra la sesión ni redirige', async () => {
    const { auth, http, router } = await signedIn();
    TestBed.inject(HttpClient).get(`${API}/pro/me`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/pro/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).error(aborted);
    await flush();
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.1.sig');
    expect(auth.user()).toEqual(PRO);
    expect(router.url).toBe('/pro/perfil');
  });

  it('refresh rechazado (401): cierra la sesión y va a /ingresar con returnUrl', async () => {
    const { auth, http, router } = await signedIn();
    TestBed.inject(HttpClient).get(`${API}/pro/me`).subscribe({ error: () => undefined });
    http.expectOne(`${API}/pro/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne(`${API}/auth/refresh`)
      .flush({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
    await flush();
    expect(auth.status()).toBe('unauthenticated');
    expect(sessionStorage.getItem(RT_KEY)).toBeNull();
    expect(router.url).toBe('/ingresar?returnUrl=%2Fpro%2Fperfil');
  });
});

describe('rutas privadas esperan initialize', () => {
  const find = (path: string, list: Route[] = routes): Route | undefined => {
    for (const r of list) {
      if (r.path === path) return r;
      const child = r.children && find(path.replace(`${r.path}/`, ''), r.children);
      if (child && path.startsWith(`${r.path}/`)) return child;
    }
    return undefined;
  };

  it('/perfil usa authGuard y TODO /pro/** usa professionalGuard (también dashboard y las demo)', () => {
    setup();
    expect(find('perfil')?.canActivate).toContain(authGuard);
    const pro = routes.find((r) => r.path === 'pro')!;
    const pages = pro.children!.filter((r) => !r.redirectTo);
    expect(pages.map((r) => r.path)).toEqual(expect.arrayContaining(['dashboard', 'perfil', 'agenda', 'estadisticas', 'plan']));
    for (const page of pages) expect(page.canActivate, page.path).toContain(professionalGuard);
  });

  for (const path of ['/pro/dashboard', '/pro/perfil']) {
    it(`${path} espera initialize: refresh OK → entra, sin redirect`, async () => {
      sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
      const { auth, http } = setup();
      auth.initialize();
      const decision = track(run(professionalGuard, path));
      await flush();
      expect(decision.done).toBe(false);
      http.expectOne(`${API}/auth/refresh`).flush(tokens(1));
      http.expectOne(`${API}/auth/me`).flush(PRO);
      await flush();
      expect(decision.value).toBe(true);
    });

    it(`${path} con sesión realmente inválida → /ingresar con returnUrl`, async () => {
      sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
      const { auth, http, router } = setup();
      auth.initialize();
      const decision = run(professionalGuard, path);
      http
        .expectOne(`${API}/auth/refresh`)
        .flush({ statusCode: 401, code: 'INVALID_REFRESH_TOKEN' }, { status: 401, statusText: 'Unauthorized' });
      expect(router.serializeUrl((await decision) as UrlTree)).toBe(`/ingresar?returnUrl=${encodeURIComponent(path)}`);
    });
  }
});

describe('panel profesional sin datos de ejemplo', () => {
  it('mientras restaura la sesión, el shell solo muestra "Cargando tu cuenta…"', () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    const fixture = TestBed.createComponent(ProShell);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Cargando tu cuenta…');
    for (const demo of DEMO) expect(text).not.toContain(demo);
    expect(fixture.nativeElement.querySelector('app-pro-sidebar, router-outlet')).toBeNull();
    expect(TestBed.inject(ProStore).me()).toBeNull(); // sin sesión no hay identidad, tampoco una de ejemplo
    http.expectOne(`${API}/auth/refresh`).flush(tokens(1));
    http.expectOne(`${API}/auth/me`).flush(PRO);
  });

  it('dashboard con error de la API: estado de error con reintento, nunca datos demo', async () => {
    const { auth, http } = setup();
    const done = auth.login({ email: PRO.email, password: 'una-clave-larga' });
    http.expectOne(`${API}/auth/login`).flush(tokens(1));
    await flush();
    http.expectOne(`${API}/auth/me`).flush(PRO);
    await done;

    const fixture = TestBed.createComponent(ProDashboardPage);
    fixture.detectChanges();
    await flush();
    for (const req of http.match(() => true)) req.flush(null, { status: 500, statusText: 'Server Error' });
    await flush();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Buen día, Mateo');
    expect(text).toContain('Reintentar');
    for (const demo of DEMO) expect(text).not.toContain(demo);
  });
});
