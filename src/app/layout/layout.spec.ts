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
import { ClientHeader } from './client-header/client-header';
import { ProSidebar } from './pro-sidebar/pro-sidebar';

// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: null,
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
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

  it('ya es profesional: "Modo profesional" (nunca "Soy profesional") y el menú ofrece el panel', async () => {
    const http = setup();
    await signIn(PRO);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    http.expectOne(pendingCount).flush({ items: [], page: 1, pageSize: 1, total: 2 });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Modo profesional');
    expect(el.textContent).not.toMatch(/Soy profesional|Soy pro\b/);
    expect(el.querySelector('a[aria-label="2 novedades en Modo profesional"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
    fixture.detectChanges();
    const items = Array.from(el.querySelectorAll('[role="menuitem"]')).map((n) => n.textContent?.trim());
    expect(items).toEqual(['Mi perfil', 'Mis solicitudes', 'Ir al panel profesional', 'Cerrar sesión']);
  });
});
