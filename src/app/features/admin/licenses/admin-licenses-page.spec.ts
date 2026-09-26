import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { adminGuard } from '../../../core/auth/auth.guard';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AdminVerification, AdminVerificationDetail } from '../../../core/models/admin';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { ADMIN_MESSAGES } from '../../../core/state/admin-licenses.store';
import { AuthStore } from '../../../core/state/auth.store';
import { AdminLicensesPage } from './admin-licenses-page';

// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';
const LIST = `${API}/admin/verifications?status=pending`;
const REVIEWED = `${API}/admin/verifications?status=reviewed`;
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };
const user = (isAdmin: boolean): AuthUser => ({
  id: 'u-1', firstName: 'Fran', lastName: 'Admin', email: 'admin@example.com', phone: null, phoneVerified: false,
  avatarUrl: null, defaultZoneId: null, professionalProfileId: null, isAdmin, createdAt: '2026-09-01T12:00:00.000Z',
});

const item = (id: string, overrides: Partial<AdminVerification> = {}): AdminVerification => ({
  id, type: 'LICENSE', status: 'PENDING', professionalId: `p-${id}`, professional: `Pro ${id}`, professionalActive: true,
  service: 'Gas', serviceSlug: 'gas', reference: `Mat. ${id}`, submittedAt: '2026-09-25T12:00:00.000Z', expiresAt: null,
  reviewedAt: null, reviewedBy: null, rejectionReason: null, document: null, ...overrides,
});
const detail = (v: AdminVerification, overrides: Partial<AdminVerificationDetail> = {}): AdminVerificationDetail => ({
  item: v, documentUrl: null, history: [], ...overrides,
});

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

async function login(isAdmin = true) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const auth = TestBed.inject(AuthStore);
  auth.initialize();
  const done = auth.login({ email: 'admin@example.com', password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user(isAdmin));
  await done;
  return { http, auth, router: TestBed.inject(Router) };
}

async function open(id?: string, view?: string) {
  const ctx = await login();
  const fixture = TestBed.createComponent(AdminLicensesPage);
  if (id) fixture.componentRef.setInput('id', id);
  if (view) fixture.componentRef.setInput('vista', view);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const button = (name: string | RegExp) =>
    [...el.querySelectorAll('button')].find((b) =>
      typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''),
    ) as HTMLButtonElement;
  const dialogButton = (name: string) =>
    [...el.querySelectorAll('dialog[open] button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
  return { ...ctx, fixture, el, render, button, dialogButton };
}

describe('adminGuard', () => {
  const run = () =>
    TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, { url: '/admin/matriculas' } as RouterStateSnapshot));

  beforeEach(() => sessionStorage.clear());

  it('deja pasar a un admin', async () => {
    await login(true);
    expect(await run()).toBe(true);
  });

  it('un usuario común vuelve al inicio, como con cualquier ruta inexistente', async () => {
    const { router } = await login(false);
    expect(router.serializeUrl((await run()) as UrlTree)).toBe('/');
  });
});

describe('AdminLicensesPage', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('dice cuántas hay para revisar y las lista', async () => {
    const t = await open();
    t.http.expectOne(LIST).flush({ items: [item('1'), item('2'), item('3', { service: 'Electricidad' })], pendingCount: 3 });
    await t.render();
    expect(t.el.textContent).toContain('Hay 3 matrículas para revisar.');
    const links = [...t.el.querySelectorAll('ul a')].map((a) => a.textContent);
    expect(links.length).toBe(3);
    expect(links[2]).toContain('Electricidad');
    expect(t.el.textContent).toContain('Elegí una matrícula de la lista para revisarla.');
  });

  it('bandeja vacía: sin ejemplos inventados', async () => {
    const t = await open();
    t.http.expectOne(LIST).flush({ items: [], pendingCount: 0 });
    await t.render();
    expect(t.el.textContent).toContain('No hay matrículas para revisar.');
    expect(t.el.textContent).toContain('Todo al día');
    expect(t.el.querySelectorAll('ul a').length).toBe(0);
  });

  it('error al cargar: ofrece reintentar', async () => {
    const t = await open();
    t.http.expectOne(LIST).flush({}, { status: 500, statusText: 'x' });
    await t.render();
    expect(t.el.textContent).toContain('No pudimos cargar las matrículas.');
    t.button('Reintentar').click();
    t.http.expectOne(LIST).flush({ items: [item('1')], pendingCount: 1 });
    await t.render();
    expect(t.el.textContent).toContain('Hay 1 matrícula para revisar.');
  });

  it('detalle: número, pista del registro y link temporal al documento', async () => {
    const t = await open('1');
    t.http.expectOne(LIST).flush({ items: [item('1')], pendingCount: 1 });
    t.http.expectOne(`${API}/admin/verifications/1`).flush(
      detail(item('1', { document: { format: 'pdf', bytes: 300_000 } }), {
        documentUrl: 'https://files.test/doc?signature=x',
        history: [{ id: '0', status: 'REJECTED', reference: 'Mat. viejo', submittedAt: '2026-09-01T12:00:00.000Z', reviewedAt: null, rejectionReason: 'No figura.' }],
      }),
    );
    await t.render();
    expect(t.el.querySelector('h2[tabindex]')?.textContent).toContain('Pro 1');
    expect(t.el.textContent).toContain('Mat. 1');
    expect(t.el.textContent).toContain('Camuzzi');
    expect(t.el.textContent).toContain('Está a nombre de Pro 1.');
    const doc = [...t.el.querySelectorAll('a')].find((a) => a.textContent?.includes('Ver documento'))!;
    expect(doc.getAttribute('href')).toBe('https://files.test/doc?signature=x');
    expect(doc.getAttribute('rel')).toContain('noreferrer');
    expect(t.el.textContent).toContain('Motivo: No figura.');
  });

  it('aprobar con vencimiento: un POST y pasa a la siguiente pendiente', async () => {
    const t = await open('1');
    t.http.expectOne(LIST).flush({ items: [item('1'), item('2')], pendingCount: 2 });
    t.http.expectOne(`${API}/admin/verifications/1`).flush(detail(item('1')));
    await t.render();
    t.button(/Aprobar/).click();
    await t.render();
    const date = t.el.querySelector<HTMLInputElement>('#approve-expires')!;
    date.value = '2028-03-31';
    date.dispatchEvent(new Event('input'));
    t.dialogButton('Aprobar').click();
    await t.render();
    const req = t.http.expectOne(`${API}/admin/verifications/1/approve`);
    expect(req.request.body).toEqual({ expiresAt: '2028-03-31' });
    // Mientras guarda no se puede cerrar ni repetir.
    expect(t.dialogButton('Volver').disabled).toBe(true);
    req.flush(item('1', { status: 'VERIFIED' }));
    await t.render();
    expect(t.router.url).toBe('/admin/matriculas/2');
    expect(t.el.textContent).toContain('Hay 1 matrícula para revisar.');
  });

  it('rechazar: exige motivo, ofrece motivos frecuentes y envía el texto', async () => {
    const t = await open('1');
    t.http.expectOne(LIST).flush({ items: [item('1')], pendingCount: 1 });
    t.http.expectOne(`${API}/admin/verifications/1`).flush(detail(item('1')));
    await t.render();
    t.button('Rechazar').click();
    await t.render();
    t.dialogButton('Rechazar matrícula').click();
    await t.render();
    t.http.expectNone(`${API}/admin/verifications/1/reject`);
    expect(t.el.textContent).toContain('Escribí entre 5 y 300 caracteres.');
    expect(t.el.querySelector('#reject-reason')?.getAttribute('aria-invalid')).toBe('true');

    t.button('La matrícula figura como vencida en el registro.').click();
    await t.render();
    t.dialogButton('Rechazar matrícula').click();
    await t.render();
    const req = t.http.expectOne(`${API}/admin/verifications/1/reject`);
    expect(req.request.body).toEqual({ reason: 'La matrícula figura como vencida en el registro.' });
    req.flush(item('1', { status: 'REJECTED' }));
    await t.render();
    expect(t.router.url).toBe('/admin/matriculas');
    expect(t.el.textContent).toContain('No hay matrículas para revisar.');
  });

  it('si otra sesión ya la revisó: lo explica y muestra el estado real', async () => {
    const t = await open('1');
    t.http.expectOne(LIST).flush({ items: [item('1')], pendingCount: 1 });
    t.http.expectOne(`${API}/admin/verifications/1`).flush(detail(item('1')));
    await t.render();
    t.button(/Aprobar/).click();
    await t.render();
    t.dialogButton('Aprobar').click();
    t.http
      .expectOne(`${API}/admin/verifications/1/approve`)
      .flush({ code: 'VERIFICATION_ALREADY_REVIEWED' }, { status: 409, statusText: 'Conflict' });
    await t.render();
    t.http.expectOne(LIST).flush({ items: [], pendingCount: 0 });
    t.http.expectOne(`${API}/admin/verifications/1`).flush(detail(item('1', { status: 'REJECTED', rejectionReason: 'Otro motivo.' })));
    await t.render();
    expect(t.el.textContent).toContain(ADMIN_MESSAGES.alreadyReviewed);
    expect(t.el.textContent).toContain('Rechazada');
    expect(t.button(/Aprobar/)).toBeUndefined();
  });

  it('revisadas: muestra la decisión y permite borrar el documento', async () => {
    const reviewed = item('9', { status: 'REJECTED', rejectionReason: 'El número no figura.', reviewedAt: '2026-09-25T15:00:00.000Z', reviewedBy: 'admin@example.com', document: { format: 'jpg', bytes: 90_000 } });
    const t = await open('9', 'revisadas');
    t.http.expectOne(REVIEWED).flush({ items: [reviewed], pendingCount: 2 });
    t.http.expectOne(`${API}/admin/verifications/9`).flush(detail(reviewed));
    await t.render();
    expect(t.el.textContent).toContain('Hay 2 matrículas para revisar.');
    expect(t.el.textContent).toContain('Motivo: El número no figura.');
    expect(t.button(/Aprobar/)).toBeUndefined();
    t.button('Borrar documento').click();
    await t.render();
    t.dialogButton('Borrar documento').click();
    t.http.expectOne(`${API}/admin/verifications/9/purge-document`).flush({ ...reviewed, document: null });
    await t.render();
    expect(t.el.textContent).toContain('no subió');
    expect(t.button('Borrar documento')).toBeUndefined();
  });
});
