import { Component, PLATFORM_ID, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { API_URL } from '../api/api.config';
import { AuthResponse, AuthUser } from '../models/auth';
import { AUTH_MESSAGES, AuthStore } from '../state/auth.store';
import { RequestStore } from '../state/request.store';
import { LoginPage } from '../../features/auth/login-page';
import { RegisterPage } from '../../features/auth/register-page';
import { QuoteRequestPage } from '../../features/client/quote-request/quote-request-page';
import { authGuard, guestGuard } from './auth.guard';
import { authInterceptor } from './auth.interceptor';
import { safeReturnUrl } from './return-url';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const RT_KEY = 'resuelve.refreshToken';

const USER: AuthUser = {
  id: 'u-1',
  firstName: 'María',
  lastName: 'González',
  email: 'maria@example.com',
  phone: '+54 249 400 1234',
  phoneVerified: false,
  avatarUrl: null,
  defaultZoneId: null,
  professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
/** Tokens con forma de JWT (el contenido no importa: el backend está mockeado). */
const tokens = (n: number): AuthResponse => ({
  accessToken: `access.${n}.sig`,
  refreshToken: `refresh.${n}.sig`,
  expiresIn: 900,
  tokenType: 'Bearer',
});

@Component({ template: '' })
class Blank {}

function setup(options: { server?: boolean; realRoutes?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'mis-solicitudes', component: Blank, data: { requiresAuth: true } },
        { path: 'presupuesto', component: QuoteRequestPage },
        { path: '**', component: Blank },
      ]),
      { provide: API_URL, useValue: API },
      ...(options.server ? [{ provide: PLATFORM_ID, useValue: 'server' }] : []),
    ],
  });
  return {
    auth: TestBed.inject(AuthStore),
    http: TestBed.inject(HttpTestingController),
    client: TestBed.inject(HttpClient),
  };
}

const flush = () => new Promise((r) => setTimeout(r));

/** Deja al store con sesión iniciada (login mockeado). */
async function signIn(auth: AuthStore, http: HttpTestingController, n = 1) {
  const done = auth.login({ email: USER.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens(n));
  await flush();
  http.expectOne(`${API}/auth/me`).flush(USER);
  await done;
}

const err = (status: number, code: string) => ({
  status,
  statusText: 'x',
  body: { statusCode: status, code, message: 'mensaje técnico del backend' },
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('AuthStore', () => {
  it('initialize sin refresh token: queda como invitado sin llamar al backend', async () => {
    const { auth, http } = setup();
    auth.initialize();
    await auth.whenReady();
    expect(auth.initializing()).toBe(false);
    expect(auth.authenticated()).toBe(false);
    http.verify();
  });

  it('initialize con refresh válido: rota el token, guarda access solo en memoria y carga /me', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    expect(auth.initializing()).toBe(true);

    const refresh = http.expectOne(`${API}/auth/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh.0.sig' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(tokens(1));

    const me = http.expectOne(`${API}/auth/me`);
    expect(me.request.headers.get('Authorization')).toBe('Bearer access.1.sig');
    me.flush(USER);
    await auth.whenReady();

    expect(auth.user()).toEqual(USER);
    expect(auth.authenticated()).toBe(true);
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.1.sig'); // rotado
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('access.1.sig');
    expect(localStorage.length).toBe(0);
  });

  it('initialize con refresh inválido: limpia sessionStorage y sigue como invitado', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.viejo.sig');
    const { auth, http } = setup();
    auth.initialize();
    const { status, statusText, body } = err(401, 'INVALID_REFRESH_TOKEN');
    http.expectOne(`${API}/auth/refresh`).flush(body, { status, statusText });
    await auth.whenReady();
    expect(auth.authenticated()).toBe(false);
    expect(auth.initializing()).toBe(false);
    expect(sessionStorage.getItem(RT_KEY)).toBeNull();
  });

  it('login: sesión iniciada, refresh token en sessionStorage y access token nunca persistido', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    expect(auth.user()?.firstName).toBe('María');
    expect(auth.accessToken()).toBe('access.1.sig');
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.1.sig');
    expect(Object.values({ ...sessionStorage, ...localStorage })).not.toContain('access.1.sig');
    expect(auth.loading()).toBe(false);
  });

  it('login: mapea errores a mensajes humanos (sin textos técnicos del backend)', async () => {
    const { auth, http } = setup();
    const cases: [ReturnType<typeof err> | 'network', string][] = [
      [err(401, 'INVALID_CREDENTIALS'), AUTH_MESSAGES.invalidCredentials],
      [err(429, 'RATE_LIMITED'), AUTH_MESSAGES.rateLimited],
      [err(503, 'INTERNAL_ERROR'), AUTH_MESSAGES.loginFailed],
      ['network', AUTH_MESSAGES.loginFailed],
    ];
    for (const [response, message] of cases) {
      const done = auth.login({ email: USER.email, password: 'x' });
      const req = http.expectOne(`${API}/auth/login`);
      if (response === 'network') req.error(new ProgressEvent('error'), { status: 0 });
      else req.flush(response.body, { status: response.status, statusText: response.statusText });
      expect(await done).toBe(false);
      expect(auth.error()?.message).toBe(message);
      expect(auth.authenticated()).toBe(false);
    }
    http.verify(); // 429: sin reintento automático
  });

  it('login: ignora un segundo submit mientras el primero está en curso', async () => {
    const { auth, http } = setup();
    const first = auth.login({ email: USER.email, password: 'x' });
    expect(await auth.login({ email: USER.email, password: 'x' })).toBe(false);
    http.expectOne(`${API}/auth/login`).flush(tokens(1));
    await flush();
    http.expectOne(`${API}/auth/me`).flush(USER);
    expect(await first).toBe(true);
  });

  it('register: el backend devuelve tokens, así que queda con la sesión iniciada', async () => {
    const { auth, http } = setup();
    const done = auth.register({ firstName: 'María', lastName: 'González', email: USER.email, password: 'una-clave-larga' });
    const req = http.expectOne(`${API}/auth/register`);
    expect(req.request.body).toEqual({ firstName: 'María', lastName: 'González', email: USER.email, password: 'una-clave-larga' });
    req.flush(tokens(1), { status: 201, statusText: 'Created' });
    await flush();
    http.expectOne(`${API}/auth/me`).flush(USER);
    expect(await done).toBe(true);
    expect(auth.authenticated()).toBe(true);
  });

  it('register: email ya registrado marca el campo email', async () => {
    const { auth, http } = setup();
    const done = auth.register({ firstName: 'A', lastName: 'B', email: USER.email, password: 'una-clave-larga' });
    const { status, statusText, body } = err(409, 'EMAIL_ALREADY_REGISTERED');
    http.expectOne(`${API}/auth/register`).flush(body, { status, statusText });
    expect(await done).toBe(false);
    expect(auth.error()).toEqual({ message: AUTH_MESSAGES.emailTaken, fields: ['email'] });
  });

  it('loadMe: pide /auth/me con Bearer y actualiza el usuario', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    const again = auth.loadMe();
    const req = http.expectOne(`${API}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access.1.sig');
    req.flush({ ...USER, firstName: 'Mari' });
    expect((await again).firstName).toBe('Mari');
    expect(auth.user()?.firstName).toBe('Mari');
  });

  it('logout: revoca en el backend, limpia todo y es idempotente aunque el backend falle', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    auth.logout();
    const req = http.expectOne(`${API}/auth/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh.1.sig' });
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null, { status: 500, statusText: 'Error' });
    expect(auth.authenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(sessionStorage.getItem(RT_KEY)).toBeNull();

    auth.logout(); // sin sesión: nada que revocar
    http.verify();
    expect(auth.authenticated()).toBe(false);
  });

  it('SSR: no toca sessionStorage ni llama al backend', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const { auth, http } = setup({ server: true });
    auth.initialize();
    expect(getItem).not.toHaveBeenCalled();
    expect(auth.initializing()).toBe(true);
    expect(auth.hasRefreshToken()).toBe(false);
    http.verify();
    getItem.mockRestore();
  });
});

describe('authInterceptor', () => {
  it('agrega Bearer a la API solo con sesión, y nunca a otros dominios', async () => {
    const { auth, http, client } = setup();
    client.get(`${API}/services`).subscribe();
    expect(http.expectOne(`${API}/services`).request.headers.has('Authorization')).toBe(false);

    await signIn(auth, http);
    client.get(`${API}/services`).subscribe();
    expect(http.expectOne(`${API}/services`).request.headers.get('Authorization')).toBe('Bearer access.1.sig');
    client.get('https://otro-sitio.test/x').subscribe();
    expect(http.expectOne('https://otro-sitio.test/x').request.headers.has('Authorization')).toBe(false);
  });

  it('401: renueva una vez y reintenta la request original una sola vez', async () => {
    const { auth, http, client } = setup();
    await signIn(auth, http);
    let result: unknown;
    client.get(`${API}/requests`).subscribe((r) => (result = r));
    http.expectOne(`${API}/requests`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokens(2));
    const retry = http.expectOne(`${API}/requests`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access.2.sig');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
    expect(sessionStorage.getItem(RT_KEY)).toBe('refresh.2.sig');
  });

  it('si el reintento vuelve a dar 401, el error se propaga sin un segundo refresh', async () => {
    const { auth, http, client } = setup();
    await signIn(auth, http);
    let status = 0;
    client.get(`${API}/requests`).subscribe({ error: (e) => (status = e.status) });
    http.expectOne(`${API}/requests`).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokens(2));
    http.expectOne(`${API}/requests`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    http.verify();
  });

  it('requests concurrentes con 401 comparten un único refresh', async () => {
    const { auth, http, client } = setup();
    await signIn(auth, http);
    const results: unknown[] = [];
    for (const path of ['a', 'b', 'c']) client.get(`${API}/${path}`).subscribe((r) => results.push(r));
    for (const path of ['a', 'b', 'c']) {
      http.expectOne(`${API}/${path}`).flush(null, { status: 401, statusText: 'Unauthorized' });
    }
    const refreshes = http.match(`${API}/auth/refresh`);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(tokens(2));
    for (const path of ['a', 'b', 'c']) {
      const retry = http.expectOne(`${API}/${path}`);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access.2.sig');
      retry.flush(path);
    }
    expect(results.sort()).toEqual(['a', 'b', 'c']);
  });

  it('un 401 que llega después de otro refresh reintenta con el token nuevo, sin otro refresh', async () => {
    const { auth, http, client } = setup();
    await signIn(auth, http);
    client.get(`${API}/a`).subscribe();
    client.get(`${API}/b`).subscribe();
    const [a, b] = [http.expectOne(`${API}/a`), http.expectOne(`${API}/b`)];
    a.flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${API}/auth/refresh`).flush(tokens(2));
    http.expectOne(`${API}/a`).flush('ok');
    b.flush(null, { status: 401, statusText: 'Unauthorized' }); // viajaba con el token viejo
    expect(http.match(`${API}/auth/refresh`).length).toBe(0);
    expect(http.expectOne(`${API}/b`).request.headers.get('Authorization')).toBe('Bearer access.2.sig');
  });

  it('refresh fallido: cierra la sesión local y redirige solo si la pantalla es personal', async () => {
    const { auth, http, client } = setup();
    const router = TestBed.inject(Router);
    await signIn(auth, http);
    await router.navigateByUrl('/mis-solicitudes');
    let failed = false;
    client.get(`${API}/requests`).subscribe({ error: () => (failed = true) });
    http.expectOne(`${API}/requests`).flush(null, { status: 401, statusText: 'Unauthorized' });
    const { status, statusText, body } = err(401, 'INVALID_REFRESH_TOKEN');
    http.expectOne(`${API}/auth/refresh`).flush(body, { status, statusText });
    await flush();
    expect(failed).toBe(true);
    expect(auth.authenticated()).toBe(false);
    expect(sessionStorage.getItem(RT_KEY)).toBeNull();
    expect(router.url).toBe('/ingresar?returnUrl=%2Fmis-solicitudes');
  });

  it('no entra en loop: un 401 de /auth/refresh no dispara otro refresh', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    let failed = false;
    auth.refresh().subscribe({ error: () => (failed = true) });
    http.expectOne(`${API}/auth/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    http.verify();
  });
});

describe('guards y returnUrl', () => {
  const snapshot = (url: string) => ({ url }) as RouterStateSnapshot;
  const route = (returnUrl?: string) =>
    ({ queryParamMap: new Map(returnUrl ? [['returnUrl', returnUrl]] : []) }) as unknown as ActivatedRouteSnapshot;
  const run = (guard: typeof authGuard, r: ActivatedRouteSnapshot, url: string) =>
    TestBed.runInInjectionContext(() => guard(r, snapshot(url))) as Promise<boolean | UrlTree>;

  it('invitado → /ingresar con returnUrl interno', async () => {
    const { auth } = setup();
    auth.initialize();
    const result = await run(authGuard, route(), '/mis-solicitudes');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/ingresar?returnUrl=%2Fmis-solicitudes');
  });

  it('usuario autenticado → permite', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    expect(await run(authGuard, route(), '/perfil')).toBe(true);
  });

  it('espera la restauración de sesión antes de decidir (F5 en /mis-solicitudes)', async () => {
    sessionStorage.setItem(RT_KEY, 'refresh.0.sig');
    const { auth, http } = setup();
    auth.initialize();
    const decision = run(authGuard, route(), '/mis-solicitudes');
    http.expectOne(`${API}/auth/refresh`).flush(tokens(1));
    http.expectOne(`${API}/auth/me`).flush(USER);
    expect(await decision).toBe(true);
  });

  it('con sesión, /ingresar respeta un returnUrl interno y rechaza uno externo', async () => {
    const { auth, http } = setup();
    await signIn(auth, http);
    const router = TestBed.inject(Router);
    const toUrl = async (r: ActivatedRouteSnapshot) => router.serializeUrl((await run(guestGuard, r, '/ingresar')) as UrlTree);
    expect(await toUrl(route('/presupuesto'))).toBe('/presupuesto');
    expect(await toUrl(route('https://evil.example'))).toBe('/perfil');
    expect(await toUrl(route('//evil.example'))).toBe('/perfil');
  });

  it('safeReturnUrl solo acepta rutas internas', () => {
    expect(safeReturnUrl('/mis-solicitudes')).toBe('/mis-solicitudes');
    expect(safeReturnUrl('/profesionales?x=1#y')).toBe('/profesionales?x=1#y');
    for (const bad of [
      'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil', 'javascript:alert(1)',
      '/javascript:alert(1)', ' //evil.example', '/%0a', 'mis-solicitudes', '/ingresar', '/registro?x=1', null, 42,
    ]) {
      expect(safeReturnUrl(bad === '/%0a' ? '/a\nb' : bad), String(bad)).toBeNull();
    }
  });
});

describe('formularios de auth', () => {
  async function renderPage<T>(type: Type<T>) {
    const fixture = TestBed.createComponent(type);
    await fixture.whenStable();
    return fixture;
  }
  const $ = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLInputElement;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('login: valida en el cliente sin llamar al backend y enfoca el error', async () => {
    const { http } = setup();
    const fixture = await renderPage(LoginPage);
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Ingresá tu email.');
    expect(el.textContent).toContain('Ingresá tu contraseña.');
    expect($(el, '#login-email').getAttribute('aria-invalid')).toBe('true');
    expect($(el, '#login-email').getAttribute('autocomplete')).toBe('email');
    expect($(el, '#login-password').getAttribute('autocomplete')).toBe('current-password');
    http.verify();
  });

  it('login: loading deshabilita el botón y un 401 muestra el mensaje amigable', async () => {
    const { http } = setup();
    const fixture = await renderPage(LoginPage);
    const el: HTMLElement = fixture.nativeElement;
    type($(el, '#login-email'), USER.email);
    type($(el, '#login-password'), 'incorrecta');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Ingresando…');
    const { status, statusText, body } = err(401, 'INVALID_CREDENTIALS');
    http.expectOne(`${API}/auth/login`).flush(body, { status, statusText });
    await flush();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Email o contraseña incorrectos.');
    expect(el.textContent).not.toContain('mensaje técnico');
    expect(button.disabled).toBe(false);
  });

  it('login: mostrar/ocultar contraseña', async () => {
    setup();
    const fixture = await renderPage(LoginPage);
    const el: HTMLElement = fixture.nativeElement;
    const toggle = el.querySelector('[aria-label="Mostrar contraseña"]') as HTMLButtonElement;
    toggle.click();
    await fixture.whenStable();
    expect($(el, '#login-password').type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Ocultar contraseña');
  });

  it('registro: valida mínimos del DTO, teléfono opcional y autocomplete', async () => {
    const { http } = setup();
    const fixture = await renderPage(RegisterPage);
    const el: HTMLElement = fixture.nativeElement;
    type($(el, '#reg-first'), 'María');
    type($(el, '#reg-last'), 'González');
    type($(el, '#reg-email'), USER.email);
    type($(el, '#reg-password'), 'corta');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(el.textContent).toContain('La contraseña necesita al menos 10 caracteres.');
    http.verify();

    expect(['given-name', 'family-name', 'email', 'tel', 'new-password']).toEqual(
      ['#reg-first', '#reg-last', '#reg-email', '#reg-phone', '#reg-password'].map((s) => $(el, s).getAttribute('autocomplete')),
    );

    type($(el, '#reg-password'), 'una-clave-larga');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    const req = http.expectOne(`${API}/auth/register`);
    expect(req.request.body).toEqual({ firstName: 'María', lastName: 'González', email: USER.email, password: 'una-clave-larga' });
    const { status, statusText, body } = err(409, 'EMAIL_ALREADY_REGISTERED');
    req.flush(body, { status, statusText });
    await flush();
    await fixture.whenStable();
    expect(el.textContent).toContain('Este email ya tiene una cuenta.');
    expect($(el, '#reg-email').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('auth gate al enviar la solicitud', () => {
  it('invitado: lleva a /ingresar con returnUrl=/presupuesto y conserva el pedido; después del login vuelve', async () => {
    const { auth, http } = setup();
    auth.initialize();
    const router = TestBed.inject(Router);
    const request = TestBed.inject(RequestStore);
    request.setService({ id: 'uuid-plomeria', name: 'Plomería', slug: 'plomeria', categoryId: 'c1', requiresLicense: false });
    request.setZone({ id: '00000000-0000-4000-8000-00000000c3e7', name: 'Centro' });
    request.updateDescription('Pierde la canilla de la cocina', false);
    request.askProfessionals([
      {
        id: 'uuid-p1', firstName: 'Ana', lastName: 'Prueba', displayName: 'Ana Prueba', avatarUrl: null, headline: null,
        bio: null, yearsExperience: 2, availableToday: true, averageResponseMinutes: null, averageRating: null,
        reviewsCount: 0, completedJobsCount: 0, services: [], zones: [],
        verifications: { identity: false, phone: false, license: false, licenses: [] },
      },
    ]);
    const before = { draft: request.draft(), recipients: request.recipientIds() };

    await router.navigateByUrl('/presupuesto');
    const page = TestBed.createComponent(QuoteRequestPage);
    await page.whenStable();
    await (page.componentInstance as unknown as { send(): Promise<void> }).send();
    await flush();
    expect(router.url).toBe('/ingresar?returnUrl=%2Fpresupuesto');
    expect(request.sending()).toBe(false);

    // Login desde /ingresar (returnUrl leído de la URL) → vuelve a /presupuesto.
    const login = TestBed.createComponent(LoginPage);
    await login.whenStable();
    const el: HTMLElement = login.nativeElement;
    for (const [sel, value] of [['#login-email', USER.email], ['#login-password', 'una-clave-larga']]) {
      const input = el.querySelector(sel) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/auth/login`).flush(tokens(1));
    await flush();
    http.expectOne(`${API}/auth/me`).flush(USER);
    await flush();
    await login.whenStable();
    expect(router.url).toBe('/presupuesto');
    expect(request.draft()).toEqual(before.draft);
    expect(request.recipientIds()).toEqual(before.recipients);
  });
});
