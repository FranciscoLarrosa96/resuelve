import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../core/api/api.config';
import { authInterceptor } from '../core/auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../core/models/auth';
import { AuthStore } from '../core/state/auth.store';
import { AVAILABILITY_MESSAGES, ProStore } from '../core/state/pro.store';
import { ToastService } from '../core/services/toast.service';
import { NotificationsStore } from '../core/state/notifications.store';
import { THEME_STORAGE_KEY } from '../core/state/theme.store';
import { ClientHeader } from './client-header/client-header';
import { ProSidebar } from './pro-sidebar/pro-sidebar';

// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: null,
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const PRO: AuthUser = { ...CLIENT, id: 'u-pro', firstName: 'Profesional', lastName: 'de prueba 1', professionalProfileId: PROFILE_ID };
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function signIn(user: AuthUser) {
  const http = TestBed.inject(HttpTestingController);
  const auth = TestBed.inject(AuthStore);
  auth.initialize();
  const done = auth.login({ email: user.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

const me = (availableToday: boolean) => ({ id: PROFILE_ID, displayName: 'Profesional de prueba 1', availableToday, planTier: 'FREE' });
const pendingCount = (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === `${API}/pro/requests` && r.params.get('status') === 'PENDING';

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

describe('sidebar profesional', () => {
  it('muestra la identidad real, sin nombre de ejemplo ni plan ficticio', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/me`).flush(me(true));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Profesional de prueba 1');
    expect(el.textContent).not.toContain('Juan Martín');
    expect(el.textContent).not.toMatch(/Plan Free|de 10|solicitudes usadas|Pasar a PRO/);
  });

  it('"Mi plan" siempre está en el menú (Free sin rótulo; PRO con rótulo discreto)', async () => {
    const plan = (tier: 'FREE' | 'PRO') => ({
      tier, source: tier === 'PRO' ? 'BILLING' : null, expiresAt: null,
      entitlements: { canSendUnlimitedQuotes: tier === 'PRO', canBeFeatured: tier === 'PRO', canUseAdvancedAnalytics: tier === 'PRO', canSeeExposureAnalytics: tier === 'PRO', canUseQuoteTemplates: false, portfolioPhotoLimit: tier === 'PRO' ? 20 : 5 },
    });
    for (const tier of ['FREE', 'PRO'] as const) {
      TestBed.resetTestingModule();
      sessionStorage.clear();
      const http = setup();
      await signIn(PRO);
      const fixture = TestBed.createComponent(ProSidebar);
      fixture.detectChanges();
      http.expectOne(`${API}/pro/me`).flush({ ...me(true), plan: plan(tier) });
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const nav = el.querySelector('nav[aria-label="Área profesional"]')!;
      const labels = [...nav.querySelectorAll('a')].map((a) => a.textContent!.replace(/\s+/g, ' ').trim());
      expect(labels.map((l) => l.replace(/ ?PRO.*$/, ''))).toEqual(['Inicio', 'Solicitudes', 'Agenda', 'Tu mes', 'Perfil', 'Mi plan']);
      const link = [...nav.querySelectorAll<HTMLAnchorElement>('a')].at(-1)!;
      expect(link.getAttribute('href')).toBe('/pro/plan');
      expect(!!link.querySelector('[data-testid="plan-nav-pro"]')).toBe(tier === 'PRO');
      http.verify({ ignoreCancelled: true });
    }
  });

  it('el modo va arriba, junto al logo; abajo solo queda la identidad', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/me`).flush(me(true));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const modes = el.querySelector('app-mode-switch')!;
    expect(modes.querySelector('[aria-current="true"]')?.textContent).toContain('Profesional');
    expect(modes.querySelector<HTMLAnchorElement>('a[aria-label="Cambiar a modo cliente"]')?.getAttribute('href')).toBe('/');
    // Arriba del menú, no perdido abajo.
    expect(modes.compareDocumentPosition(el.querySelector('nav')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.textContent).not.toContain('Ver como cliente');
    expect(el.textContent).toContain(PRO.email);
  });

  it('"Disponible hoy" persiste con PATCH /pro/availability y avisa discretamente', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/me`).flush(me(false));
    fixture.detectChanges();
    const sw = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw().getAttribute('aria-checked')).toBe('false');
    sw().click();
    fixture.detectChanges();
    expect(sw().disabled).toBe(true); // loading localizado
    const patch = http.expectOne({ method: 'PATCH', url: `${API}/pro/availability` });
    expect(patch.request.body).toEqual({ availableToday: true });
    patch.flush(me(true));
    await flush();
    fixture.detectChanges();
    expect(sw().getAttribute('aria-checked')).toBe('true');
    expect(TestBed.inject(ToastService).message()).toBe(AVAILABILITY_MESSAGES.updated);
  });

  it('si el backend falla, vuelve al valor real (sin estado local que engañe)', async () => {
    const http = setup();
    await signIn(PRO);
    const store = TestBed.inject(ProStore);
    TestBed.tick();
    http.expectOne(`${API}/pro/me`).flush(me(true));
    const saving = store.setAvailability(false);
    http.expectOne(`${API}/pro/availability`).flush({ statusCode: 500 }, { status: 500, statusText: 'x' });
    expect(await saving).toBe(false);
    expect(store.available()).toBe(true);
  });

  it('sin perfil profesional no hay switch (ni pedido a /pro/me)', async () => {
    const http = setup();
    await signIn(CLIENT);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    http.expectNone(`${API}/pro/me`);
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="switch"]')).toBeNull();
  });
});

describe('header del cliente', () => {
  it('sin perfil profesional: "Soy profesional"', async () => {
    setup();
    await signIn(CLIENT);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Soy profesional');
    expect(text).not.toContain('Modo profesional');
  });

  it('ya es profesional: cambio de modo Cliente | Profesional (nunca "Soy profesional") y el menú ofrece el panel', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    // Lo que espera en modo profesional sale de las novedades agrupadas (2 solicitudes nuevas).
    TestBed.inject(NotificationsStore).summary.set({
      client: { unread: 0, completionDue: 0 },
      professional: { unread: 2, completionDue: 0, requests: { total: 2, PENDING: 2, QUOTED: 0, SELECTED: 0 }, agenda: 0 },
    });
    // Ya no cuenta invitaciones por su cuenta: una sola fuente (notificaciones).
    http.expectNone(pendingCount);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const modes = el.querySelector('app-mode-switch [role="group"]')!;
    expect(modes.getAttribute('aria-label')).toBe('Modo de uso');
    expect(modes.querySelector('[aria-current="true"]')?.textContent).toContain('Cliente');
    expect(el.textContent).not.toMatch(/Soy profesional|Soy pro\b/);
    const pro = el.querySelector<HTMLAnchorElement>('a[aria-label="2 novedades en Modo profesional"]')!;
    expect(pro.getAttribute('href')).toBe('/pro/dashboard');
    expect(pro.textContent).toContain('Profesional');
    el.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
    fixture.detectChanges();
    const items = Array.from(el.querySelectorAll('[role="menuitem"]')).map((n) => n.textContent?.trim());
    expect(items).toEqual(['Mi perfil', 'Mis solicitudes', 'Modo profesional', 'Cerrar sesión']);
  });
});

describe('menú de cuenta (cliente y profesional)', () => {
  const openMenu = (el: HTMLElement) => {
    el.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
  };
  const menuItems = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[role="menuitem"]')).map((n) => n.textContent?.trim());

  it('profesional: tocar nombre/avatar del sidebar abre Mi perfil · Mi plan · Ver como cliente · (separador) Cerrar sesión', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/me`).flush(me(true));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const trigger = el.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    expect(trigger.getAttribute('aria-label')).toBe('Tu cuenta, Profesional de prueba 1');
    expect(trigger.textContent).toContain(PRO.email);
    openMenu(el);
    fixture.detectChanges();
    expect(menuItems(el)).toEqual(['Mi perfil', 'Mi plan', 'Ver como cliente', 'Cerrar sesión']);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/pro/perfil', '/pro/plan', '/']);
    // "Cerrar sesión" separado del resto y con ícono de salida.
    const logout = Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"]')).at(-1)!;
    expect(logout.previousElementSibling?.getAttribute('role')).toBe('separator');
    expect(logout.querySelector('app-icon')).not.toBeNull();
  });

  it('tema: Claro · Oscuro · Sistema (Sistema por defecto), se aplica al documento y persiste', async () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    const http = setup();
    await signIn(CLIENT);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    openMenu(el);
    fixture.detectChanges();
    const radios = () => Array.from(el.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(radios().map((r) => r.textContent?.trim())).toEqual(['Claro', 'Oscuro', 'Sistema']);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(el.querySelector('[data-testid="theme-options"]')!.getAttribute('aria-labelledby')).toBeTruthy();

    radios()[1].click();
    fixture.detectChanges();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');
    // Elegir tema no cierra el menú.
    expect(el.querySelector('[role="menu"]')).not.toBeNull();

    radios()[0].click();
    fixture.detectChanges();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    localStorage.removeItem(THEME_STORAGE_KEY);
    http.verify({ ignoreCancelled: true });
  });

  it('teclado: Escape cierra y devuelve el foco al disparador', async () => {
    const http = setup();
    await signIn(CLIENT);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    document.body.appendChild(el);
    openMenu(el);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).not.toBeNull();
    const menu = el.querySelector<HTMLElement>('[role="menu"]')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement?.textContent?.trim()).toBe('Cerrar sesión');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('[aria-haspopup="menu"]'));
    el.remove();
    http.verify({ ignoreCancelled: true });
  });

  it('Cerrar sesión: POST /auth/logout una sola vez, limpia la sesión y no deja datos personales', async () => {
    const http = setup();
    await signIn(CLIENT);
    const auth = TestBed.inject(AuthStore);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    openMenu(el);
    fixture.detectChanges();
    Array.from(el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).find((b) => b.textContent?.includes('Cerrar sesión'))!.click();
    fixture.detectChanges();
    const logout = http.expectOne(`${API}/auth/logout`);
    expect(logout.request.body).toEqual({ refreshToken: tokens.refreshToken });
    logout.flush(null);
    expect(auth.user()).toBeNull();
    expect(auth.authenticated()).toBe(false);
    expect(Object.values({ ...sessionStorage }).join(' ')).not.toContain(tokens.refreshToken);
    // Sin sesión, el header ya no muestra al usuario sino Ingresar / Crear cuenta.
    expect(el.textContent).not.toContain(CLIENT.email);
    expect(el.textContent).toContain('Ingresar');
    http.expectNone(`${API}/auth/logout`);
  });
});
