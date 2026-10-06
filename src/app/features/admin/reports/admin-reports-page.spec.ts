import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AdminReport } from '../../../core/models/admin';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { REPORT_MESSAGES } from '../../../core/state/admin-reports.store';
import { AuthStore } from '../../../core/state/auth.store';
import { AdminReportsPage } from './admin-reports-page';

const API = 'http://api.test/api/v1';
const tokens: AuthResponse = {
  accessToken: 'a.1.s',
  refreshToken: 'r.1.s',
  expiresIn: 900,
  tokenType: 'Bearer',
};
const admin: AuthUser = {
  id: 'u-1',
  firstName: 'Fran',
  lastName: 'Admin',
  email: 'admin@example.com',
  phone: null,
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
  avatarUrl: null,
  defaultZoneId: null,
  professionalProfileId: null,
  isAdmin: true,
  createdAt: '2026-09-01T12:00:00.000Z',
};

const report = (id: string, o: Partial<AdminReport> = {}): AdminReport => ({
  reportId: id,
  status: 'OPEN',
  reason: 'FAKE',
  details: null,
  reportedAt: '2026-10-05T12:00:00.000Z',
  reporterEmail: 'otro@correo.com',
  reviewId: `rev-${id}`,
  rating: 1,
  comment: 'Mala experiencia',
  kind: 'INVITADA',
  reviewer: 'Tito',
  professional: 'Pro Uno',
  professionalId: 'p-1',
  hidden: false,
  hiddenReason: null,
  resolvedAt: null,
  resolvedBy: null,
  ...o,
});

@Component({ template: '' })
class Blank {}
const flush = () => new Promise((r) => setTimeout(r));

async function open(vista?: string) {
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
  const done = auth.login({ email: admin.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(admin);
  await done;
  const fixture = TestBed.createComponent(AdminReportsPage);
  if (vista) fixture.componentRef.setInput('vista', vista);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { http, fixture, el, render };
}

describe('AdminReportsPage', () => {
  it('lista los reportes abiertos con quién, sobre quién y por qué', async () => {
    const { http, el, render } = await open();
    http
      .expectOne(`${API}/admin/reports?status=open`)
      .flush({ items: [report('r1', { details: 'Nunca vino' })], openCount: 1 });
    await render();
    expect(el.querySelector('h1')?.textContent).toContain('Reportes de reseñas');
    const card = el.querySelector('[data-testid="report-r1"]')!;
    expect(card.textContent).toContain('Tito');
    expect(card.textContent).toContain('Pro Uno');
    expect(card.textContent).toContain('Falsa o de alguien que no trabajó');
    expect(card.textContent).toContain('otro@correo.com');
    expect(card.textContent).toContain('Nunca vino');
    expect(el.textContent).toContain('1 reporte');
  });

  it('descartar llama al backend y recarga la lista', async () => {
    const { http, el, render } = await open();
    http
      .expectOne(`${API}/admin/reports?status=open`)
      .flush({ items: [report('r1')], openCount: 1 });
    await render();
    (el.querySelector('[data-testid="dismiss"]') as HTMLButtonElement).click();
    http.expectOne(`${API}/admin/reports/r1/dismiss`).flush(report('r1', { status: 'DISMISSED' }));
    await flush();
    http.expectOne(`${API}/admin/reports?status=open`).flush({ items: [], openCount: 0 });
    await render();
    expect(el.textContent).toContain('Todo al día');
  });

  it('ocultar pide un motivo de al menos 5 caracteres y lo envía', async () => {
    const { http, fixture, el, render } = await open();
    http
      .expectOne(`${API}/admin/reports?status=open`)
      .flush({ items: [report('r1')], openCount: 1 });
    await render();
    (el.querySelector('[data-testid="hide"]') as HTMLButtonElement).click();
    await render();
    const confirm = () =>
      document.querySelector('[data-testid="hide-confirm"]') as HTMLButtonElement;
    expect(confirm().disabled).toBe(true);
    const area = document.querySelector('#hide-reason') as HTMLTextAreaElement;
    area.value = 'Lenguaje ofensivo';
    area.dispatchEvent(new Event('input'));
    await render();
    expect(confirm().disabled).toBe(false);
    confirm().click();
    const req = http.expectOne(`${API}/admin/reports/r1/hide`);
    expect(req.request.body).toEqual({ reason: 'Lenguaje ofensivo' });
    req.flush(report('r1', { status: 'HIDDEN', hidden: true }));
    await flush();
    http.expectOne(`${API}/admin/reports?status=open`).flush({ items: [], openCount: 0 });
    await render();
    fixture.destroy();
  });

  it('en resueltos permite volver a mostrar una reseña oculta', async () => {
    const { http, el, render } = await open('resueltos');
    http.expectOne(`${API}/admin/reports?status=resolved`).flush({
      items: [
        report('r2', {
          status: 'HIDDEN',
          hidden: true,
          hiddenReason: 'Spam',
          resolvedBy: 'admin@example.com',
          resolvedAt: '2026-10-05T13:00:00.000Z',
        }),
      ],
      openCount: 0,
    });
    await render();
    expect(el.textContent).toContain('Oculta');
    expect(el.textContent).toContain('Motivo: Spam');
    expect(el.querySelector('[data-testid="hide"]')).toBeNull();
    (el.querySelector('[data-testid="restore"]') as HTMLButtonElement).click();
    http.expectOne(`${API}/admin/reports/reviews/rev-r2/restore`).flush({ restored: true });
    await flush();
    http.expectOne(`${API}/admin/reports?status=resolved`).flush({ items: [], openCount: 0 });
    await render();
  });

  it('si otra sesión ya lo resolvió (409) avisa y recarga', async () => {
    const { http, el, render } = await open();
    http
      .expectOne(`${API}/admin/reports?status=open`)
      .flush({ items: [report('r1')], openCount: 1 });
    await render();
    (el.querySelector('[data-testid="dismiss"]') as HTMLButtonElement).click();
    http
      .expectOne(`${API}/admin/reports/r1/dismiss`)
      .flush(
        { statusCode: 409, code: 'REPORT_ALREADY_RESOLVED', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await flush();
    http.expectOne(`${API}/admin/reports?status=open`).flush({ items: [], openCount: 0 });
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      REPORT_MESSAGES.alreadyResolved,
    );
  });

  it('muestra error con Reintentar si la lista falla', async () => {
    const { http, el, render } = await open();
    http.expectOne(`${API}/admin/reports?status=open`).flush({}, { status: 500, statusText: 'x' });
    await render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos cargar los reportes',
    );
  });
});
