import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AdminUserDetail, AdminUserItem, AdminUserList } from '../../../core/models/admin';
import { USER_MESSAGES } from '../../../core/state/admin-users.store';
import { AdminUsersPage } from './admin-users-page';

const API = 'http://api.test/api/v1';
const USERS = `${API}/admin/users`;

const item = (o: Partial<AdminUserItem> = {}): AdminUserItem => ({
  id: 'u1',
  firstName: 'Ana',
  lastName: 'Prueba',
  email: 'ana@test.dev',
  createdAt: '2026-09-01T12:00:00.000Z',
  deletedAt: null,
  isAdmin: false,
  professional: { id: 'p1', slug: 'ana', status: 'ACTIVE', pro: false },
  ...o,
});

const list = (items: AdminUserItem[] = [item()], total = items.length): AdminUserList => ({
  items,
  total,
  page: 1,
  pageSize: 25,
});

const detail = (o: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  user: { ...item(), phone: null, emailVerifiedAt: null, termsAcceptedAt: '2026-09-01T12:00:00.000Z' },
  activity: {
    requests: 0,
    quotes: 2,
    jobs: 1,
    reviewsWritten: 0,
    reviewsReceived: 1,
    counterparts: 1,
    openSubscriptions: 0,
  },
  blockers: [],
  ...o,
});

@Component({ template: '' })
class Blank {}
const flush = () => new Promise((r) => setTimeout(r));

async function open(id?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AdminUsersPage);
  if (id) fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { http, el, render, fixture };
}

describe('AdminUsersPage', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista cuentas con sus marcas y busca por texto y tipo', async () => {
    const { http, el, render } = await open();
    const first = http.expectOne((r) => r.url === USERS);
    expect(first.request.params.get('kind')).toBe('active');
    expect(first.request.params.has('q')).toBe(false);
    first.flush(list([item(), item({ id: 'u2', email: 'beto@test.dev', professional: null, isAdmin: true })]));
    await render();
    expect(el.querySelector('[data-testid="count"]')?.textContent).toContain('1–2 de 2 cuentas');
    const rows = el.querySelectorAll('[data-testid="users"] li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Profesional');
    expect(rows[1].textContent).toContain('Admin');

    (el.querySelector('#user-q') as HTMLInputElement).value = ' prueba ';
    (el.querySelector('[data-testid="search"]') as HTMLButtonElement).click();
    const searched = http.expectOne((r) => r.url === USERS);
    expect(searched.request.params.get('q')).toBe('prueba');
    searched.flush(list([]));
    await render();
    expect(el.textContent).toContain('Ninguna cuenta coincide.');

    const select = el.querySelector('#user-kind') as HTMLSelectElement;
    select.value = 'deleted';
    select.dispatchEvent(new Event('change'));
    const filtered = http.expectOne((r) => r.url === USERS);
    expect(filtered.request.params.get('kind')).toBe('deleted');
    expect(filtered.request.params.get('page')).toBe('1');
    filtered.flush(list([]));
  });

  it('pagina cuando hay más de una página', async () => {
    const { http, el, render } = await open();
    http.expectOne((r) => r.url === USERS).flush(list([item()], 60));
    await render();
    expect(el.textContent).toContain('Página 1 de 3');
    const next = [...el.querySelectorAll('nav[aria-label="Páginas"] button')].find((b) =>
      b.textContent?.includes('Siguiente'),
    ) as HTMLButtonElement;
    next.click();
    const req = http.expectOne((r) => r.url === USERS);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ ...list([item()], 60), page: 2 });
  });

  it('detalle: actividad y bloqueos deshabilitan "Dar de baja"', async () => {
    const { http, el, render } = await open('u1');
    http
      .expectOne(`${USERS}/u1`)
      .flush(detail({ blockers: [{ code: 'ACTIVE_JOBS', count: 1 }] }));
    await render();
    expect(el.querySelector('h1')?.textContent).toContain('Ana Prueba');
    expect(el.querySelector('[data-testid="activity"]')?.textContent).toContain('2 presupuestos enviados');
    expect(el.querySelector('[data-testid="blockers"]')?.textContent).toContain('1 trabajo en curso');
    expect((el.querySelector('[data-testid="deactivate"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('una cuenta admin no muestra acciones', async () => {
    const { http, el, render } = await open('u1');
    http.expectOne(`${USERS}/u1`).flush(detail({ user: { ...detail().user, isAdmin: true } }));
    await render();
    expect(el.querySelector('[data-testid="protected"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="purge"]')).toBeNull();
  });

  it('dar de baja pide confirmación y muestra el detalle actualizado', async () => {
    const { http, el, render } = await open('u1');
    http.expectOne(`${USERS}/u1`).flush(detail());
    await render();
    (el.querySelector('[data-testid="deactivate"]') as HTMLButtonElement).click();
    await render();
    http.expectNone(`${USERS}/u1/deactivate`);
    (document.querySelector('[data-testid="confirm-deactivate"]') as HTMLButtonElement).click();
    http.expectOne(`${USERS}/u1/deactivate`).flush(
      detail({
        user: {
          ...detail().user,
          firstName: 'Usuario',
          lastName: 'eliminado',
          deletedAt: '2026-10-07T12:00:00.000Z',
        },
      }),
    );
    await render();
    http.expectOne((r) => r.url === USERS).flush(list([]));
    await render();
    expect(el.querySelector('h1')?.textContent).toContain('Usuario eliminado');
    expect(el.querySelector('[data-testid="deactivate"]')).toBeNull();
  });

  it('borrar exige escribir el email exacto, avisa a quién afecta y vuelve al listado', async () => {
    const { http, el, render } = await open('u1');
    http.expectOne(`${USERS}/u1`).flush(detail({ activity: { ...detail().activity, openSubscriptions: 1 } }));
    await render();
    (el.querySelector('[data-testid="purge"]') as HTMLButtonElement).click();
    await render();
    expect(document.querySelector('[data-testid="purge-counterparts"]')?.textContent).toContain('1 otra persona');
    expect(document.querySelector('[data-testid="purge-subscription"]')).not.toBeNull();
    const confirm = document.querySelector('[data-testid="confirm-purge"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    const input = document.querySelector('#purge-email') as HTMLInputElement;
    input.value = 'otra@test.dev';
    input.dispatchEvent(new Event('input'));
    await render();
    expect(confirm.disabled).toBe(true);

    input.value = 'ANA@test.dev ';
    input.dispatchEvent(new Event('input'));
    await render();
    expect(confirm.disabled).toBe(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    confirm.click();
    const req = http.expectOne(`${USERS}/u1/purge`);
    expect(req.request.body).toEqual({ confirmEmail: 'ANA@test.dev' });
    req.flush({ purged: true });
    await render();
    expect(navigate).toHaveBeenCalledWith(['/admin/usuarios']);
    http.expectOne((r) => r.url === USERS).flush(list([]));
  });

  it('si el servidor rechaza el borrado, lo explica sin salir', async () => {
    const { http, render } = await open('u1');
    http.expectOne(`${USERS}/u1`).flush(detail());
    await render();
    (document.querySelector('[data-testid="purge"]') as HTMLButtonElement).click();
    await render();
    const input = document.querySelector('#purge-email') as HTMLInputElement;
    input.value = 'ana@test.dev';
    input.dispatchEvent(new Event('input'));
    await render();
    (document.querySelector('[data-testid="confirm-purge"]') as HTMLButtonElement).click();
    http
      .expectOne(`${USERS}/u1/purge`)
      .flush(
        { statusCode: 502, code: 'ACCOUNT_DELETE_FAILED', message: 'x' },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await render();
    expect(document.body.textContent).toContain(USER_MESSAGES.files);
  });
});
