import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../models/auth';
import { AppNotification, NotificationsSummary, requestNews } from '../models/notification';
import { Appointment, ServiceRequest } from '../models/request';
import { clientStage } from '../models/request-status';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';
import { NotificationsStore } from './notifications.store';
import { MyRequestsPage } from '../../features/client/my-requests/my-requests-page';
import { RequestDetailPage } from '../../features/client/my-requests/request-detail/request-detail-page';
import { ClientHeader } from '../../layout/client-header/client-header';
import { ProSidebar } from '../../layout/pro-sidebar/pro-sidebar';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const REQ_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const PRO_1 = '22222222-2222-4222-8222-222222222222';
const APPT = '44444444-4444-4444-8444-444444444444';
const HOUR = 3600 * 1000;

const USER: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: '+54 249 400 1234',
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const PRO_USER: AuthUser = { ...USER, id: 'u-pro', firstName: 'Juan', professionalProfileId: PRO_1 };
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: APPT, status: 'CONFIRMED', startsAt: iso(-3 * HOUR), endsAt: iso(-HOUR), durationMinutes: 120, note: null,
  cancelledBy: null, createdAt: '2026-09-25T13:00:00.000Z', updatedAt: '2026-09-25T13:00:00.000Z',
  ...overrides,
});

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: REQ_ID, title: 'Problema eléctrico', description: 'Salta la térmica.', urgency: 'FLEXIBLE',
  status: 'WAITING_QUOTES', desiredDate: null, desiredTimeRange: null,
  service: { id: 's', name: 'Electricidad', slug: 'electricidad' }, zone: { id: 'z', name: 'Centro', slug: 'centro' },
  photos: [], createdAt: '2026-09-25T13:00:00.000Z', updatedAt: '2026-09-25T13:00:00.000Z',
  exactAddress: 'Alem 455', selectedProfessionalId: null, acceptedQuoteId: null, completedAt: null, completedBy: null,
  cancelledAt: null, appointment: null, completionDue: false, review: null, canReview: false,
  invitations: [
    {
      id: 'inv-1', professionalId: PRO_1, status: 'PENDING', sentAt: '2026-09-25T13:00:00.000Z', respondedAt: null,
      professional: { id: PRO_1, displayName: 'Francisco Fernández', avatarUrl: null, averageRating: null, reviewsCount: 0 },
    },
  ],
  ...overrides,
});

/** Trabajo agendado con el profesional elegido. */
const scheduled = (overrides: Partial<ServiceRequest> = {}) =>
  request({
    status: 'SCHEDULED', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1',
    invitations: [{ ...request().invitations[0], status: 'SELECTED' }],
    ...overrides,
  });

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n-1', type: 'CLIENT_QUOTE_RECEIVED', requestId: REQ_ID, requestTitle: 'Problema eléctrico',
  professionalName: 'Francisco Fernández', createdAt: '2026-09-26T13:00:00.000Z', readAt: null,
  ...overrides,
});

const summary = (client = 0, clientDue = 0, pro: NotificationsSummary['professional'] = null): NotificationsSummary => ({
  client: { unread: client, completionDue: clientDue },
  professional: pro,
});

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }], withComponentInputBinding()),
      { provide: API_URL, useValue: API },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function signIn(user: AuthUser) {
  const auth = TestBed.inject(AuthStore);
  const http = TestBed.inject(HttpTestingController);
  auth.initialize();
  const done = auth.login({ email: user.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

const summaryUrl = `${API}/me/notifications/summary`;
const listUrl = (audience: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === `${API}/me/notifications` && r.params.get('audience') === audience;

/** Sesión + notificaciones conectadas (como hace la raíz de la app) + primera consulta. */
async function connected(user: AuthUser, first: NotificationsSummary, items: AppNotification[] = []) {
  const http = setup();
  const store = TestBed.inject(NotificationsStore);
  store.connect();
  await signIn(user);
  TestBed.tick();
  http.expectOne(summaryUrl).flush(first);
  await flush();
  if (first.client.unread) http.expectOne(listUrl('CLIENT')).flush(items);
  await flush();
  return { http, store };
}

const buttons = (el: Element) => Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
const button = (el: Element, label: string) => buttons(el).find((b) => (b.textContent ?? '').trim() === label);
const labels = (el: Element) => buttons(el).map((b) => (b.textContent ?? '').trim());
const dialog = (el: HTMLElement) => el.querySelector<HTMLDialogElement>('dialog[open]');

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

// ---------------------------------------------------------------------------
describe('notificaciones: textos y estados contextuales', () => {
  it('novedad más relevante por solicitud', () => {
    setup();
    expect(requestNews([])).toBeNull();
    expect(requestNews([notification()])).toBe('Nuevo presupuesto');
    expect(requestNews([notification(), notification({ id: 'n-2' })])).toBe('2 presupuestos nuevos');
    expect(requestNews([notification({ type: 'CLIENT_APPOINTMENT_PROPOSED' })])).toBe('Nuevo horario propuesto');
    expect(requestNews([notification({ type: 'PRO_APPOINTMENT_CONFIRMED' })])).toBe('Horario confirmado');
  });

  it('estado que el cliente tiene que entender AHORA (sin otro estado persistido)', () => {
    setup();
    expect(clientStage(request()).label).toBe('Esperando presupuestos');
    expect(clientStage(request({ status: 'QUOTES_RECEIVED' })).label).toBe('Presupuestos recibidos');
    expect(clientStage(request({ status: 'PROFESSIONAL_SELECTED' })).label).toBe('Profesional seleccionado');
    expect(clientStage(request({ status: 'PROFESSIONAL_SELECTED', appointment: appointment({ status: 'PROPOSED', endsAt: iso(HOUR) }) })))
      .toMatchObject({ label: 'Horario por confirmar', next: 'Confirmá el horario' });
    expect(clientStage(scheduled({ appointment: appointment({ startsAt: iso(HOUR), endsAt: iso(3 * HOUR) }) })).label).toBe('Trabajo agendado');
    // Termina el horario mientras la pantalla está abierta: cambia sin recargar.
    const later = Date.now() + 4 * HOUR;
    expect(clientStage(scheduled({ appointment: appointment({ startsAt: iso(HOUR), endsAt: iso(3 * HOUR) }) }), later).label)
      .toBe('Pendiente de confirmar');
    expect(clientStage(scheduled({ appointment: appointment(), completionDue: true }))).toMatchObject({
      label: 'Pendiente de confirmar',
      next: '¿Se realizó el trabajo?',
    });
    expect(clientStage(request({ status: 'COMPLETED' })).label).toBe('Trabajo realizado');
    expect(clientStage(request({ status: 'CANCELLED' })).label).toBe('Cancelada');
  });
});

// ---------------------------------------------------------------------------
describe('notificaciones: store y badges', () => {
  it('sin connect() no consulta nada (ninguna pantalla aislada hace polling)', async () => {
    const http = setup();
    TestBed.inject(NotificationsStore);
    await signIn(USER);
    TestBed.tick();
    http.expectNone(summaryUrl);
  });

  it('al iniciar sesión: resumen + no leídas del cliente; el badge suma novedades y trabajos por confirmar', async () => {
    const { http, store } = await connected(USER, summary(2, 1), [notification(), notification({ id: 'n-2', requestId: OTHER_ID })]);
    http.expectNone(listUrl('PROFESSIONAL'));
    expect(store.clientBadge()).toBe(3);
    expect(store.clientByRequest().get(REQ_ID)?.length).toBe(1);
    // La primera carga no anuncia nada: no son "nuevas mientras la app estaba abierta".
    expect(TestBed.inject(ToastService).message()).toBeNull();
  });

  it('una notificación nueva durante el polling → toast discreto UNA sola vez, con "Ver"', async () => {
    const { http, store } = await connected(USER, summary(0));
    const toast = TestBed.inject(ToastService);
    let done = store.refresh();
    http.expectOne(summaryUrl).flush(summary(1));
    await flush();
    http.expectOne(listUrl('CLIENT')).flush([notification()]);
    await done;
    expect(toast.message()).toBe('Nuevo presupuesto para “Problema eléctrico”.');
    expect(toast.action()).toEqual({ label: 'Ver', link: [`/mis-solicitudes/${REQ_ID}`] });
    expect(store.arrivals()).toBe(1);
    toast.dismiss();
    done = store.refresh();
    http.expectOne(summaryUrl).flush(summary(1));
    await flush();
    http.expectOne(listUrl('CLIENT')).flush([notification()]);
    await done;
    expect(toast.message()).toBeNull();
    expect(store.arrivals()).toBe(1);
  });

  it('header: "Mis solicitudes 2" con texto accesible; profesional: su badge aparte', async () => {
    const { http } = await connected(USER, summary(2), [notification(), notification({ id: 'n-2' })]);
    const fixture = TestBed.createComponent(ClientHeader);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[aria-label="2 novedades en Mis solicitudes"]');
    expect(link?.textContent).toContain('Mis solicitudes');
    expect(link?.textContent).toContain('2');
    http.verify();
  });

  it('sidebar profesional: Agenda con los trabajos pendientes de cierre (sin mezclar con los del cliente)', async () => {
    const { http } = await connected(PRO_USER, summary(0, 3, { unread: 0, completionDue: 1 }));
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    for (const r of http.match(() => true)) r.flush({ items: [], page: 1, pageSize: 1, total: 0 });
    fixture.detectChanges();
    const agenda = (fixture.nativeElement as HTMLElement).querySelector('a[href="/pro/agenda"]');
    expect(agenda?.getAttribute('aria-label')).toBe('Agenda, 1 trabajo pendiente de cierre');
    expect(agenda?.textContent).toContain('1');
    expect(agenda?.textContent).not.toContain('3');
  });
});

// ---------------------------------------------------------------------------
describe('Mis solicitudes: novedad y estado en cada tarjeta', () => {
  it('"Nuevo presupuesto" / "2 presupuestos nuevos" y estados contextuales', async () => {
    const { http } = await connected(USER, summary(3), [
      notification(),
      notification({ id: 'n-2', requestId: OTHER_ID }),
      notification({ id: 'n-3', requestId: OTHER_ID }),
    ]);
    const fixture = TestBed.createComponent(MyRequestsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${API}/requests/mine`).flush({
      items: [
        request({ status: 'QUOTES_RECEIVED' }),
        request({ id: OTHER_ID, title: 'Canilla', status: 'QUOTES_RECEIVED' }),
        request({ id: 'r-3', title: 'Horario', status: 'PROFESSIONAL_SELECTED', appointment: appointment({ status: 'PROPOSED', endsAt: iso(HOUR) }) }),
        scheduled({ id: 'r-4', title: 'Vencido', appointment: appointment(), completionDue: true }),
      ],
      page: 1, pageSize: 20, total: 4,
    });
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a[href^="/mis-solicitudes/"]'));
    const card = (id: string) => cards.find((c) => c.getAttribute('href') === `/mis-solicitudes/${id}`)!.textContent ?? '';
    expect(card(REQ_ID)).toContain('Nuevo presupuesto');
    expect(card(OTHER_ID)).toContain('2 presupuestos nuevos');
    expect(card('r-3')).toContain('Horario por confirmar');
    expect(card('r-3')).toContain('Confirmá el horario');
    expect(card('r-3')).not.toContain('Profesional seleccionado');
    expect(card('r-4')).toContain('Pendiente de confirmar');
    expect(card('r-4')).toContain('¿Se realizó el trabajo?');
  });
});

// ---------------------------------------------------------------------------
describe('detalle del cliente: leído y cierre después del horario', () => {
  async function open(r: ServiceRequest, first = summary(0), items: AppNotification[] = []) {
    const { http, store } = await connected(USER, first, items);
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    for (const x of http.match((q) => q.url.endsWith('/categories') || q.url.endsWith('/services'))) x.flush([]);
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(r);
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    return { http, store, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('abrir la solicitud marca leídas SOLO sus novedades y el badge baja sin F5', async () => {
    const { http, store } = await open(request({ status: 'QUOTES_RECEIVED' }), summary(2), [
      notification(),
      notification({ id: 'n-2', requestId: OTHER_ID }),
    ]);
    const patch: TestRequest = http.expectOne(
      (r) => r.method === 'PATCH' && r.url === `${API}/me/notifications/read-by-request/${REQ_ID}`,
    );
    expect(patch.request.params.get('audience')).toBe('CLIENT');
    patch.flush(summary(1));
    await flush();
    expect(store.clientBadge()).toBe(1);
    expect(store.clientByRequest().has(REQ_ID)).toBe(false);
    expect(store.clientByRequest().has(OTHER_ID)).toBe(true);
  });

  it('si la novedad llega con la solicitud abierta (polling): se relee y queda leída sin F5', async () => {
    const { http, store } = await open(request({ status: 'WAITING_QUOTES' }));
    http.expectNone((r) => r.method === 'PATCH');
    const done = store.refresh();
    http.expectOne(summaryUrl).flush(summary(1));
    await flush();
    http.expectOne(listUrl('CLIENT')).flush([notification()]);
    await done;
    TestBed.tick();
    // El detalle se relee (llegó un presupuesto) y la novedad se marca leída.
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(request({ status: 'QUOTES_RECEIVED' }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    const patch = http.expectOne((r) => r.method === 'PATCH' && r.url === `${API}/me/notifications/read-by-request/${REQ_ID}`);
    patch.flush(summary(0));
    await flush();
    expect(store.clientBadge()).toBe(0);
  });

  it('sin novedades de esa solicitud no se pide nada', async () => {
    const { http } = await open(request({ status: 'QUOTES_RECEIVED' }), summary(1), [notification({ requestId: OTHER_ID })]);
    http.expectNone((r) => r.method === 'PATCH');
  });

  it('agendado y el horario no terminó: "Cancelar horario", sin cierre ni reseña', async () => {
    const { el } = await open(scheduled({ appointment: appointment({ startsAt: iso(HOUR), endsAt: iso(3 * HOUR) }) }));
    expect(el.textContent).toContain('Trabajo agendado');
    expect(labels(el)).toContain('Cancelar horario');
    expect(labels(el).some((l) => /Sí, se realizó|reprogramar|Dejar reseña/.test(l))).toBe(false);
  });

  it('pasó el horario: "¿Se realizó el trabajo?" reemplaza a "Cancelar horario" (y todavía no hay reseña)', async () => {
    const { el } = await open(scheduled({ appointment: appointment(), completionDue: true }));
    expect(el.textContent).toContain('¿Se realizó el trabajo?');
    expect(el.textContent).toContain('El horario agendado ya pasó.');
    expect(el.textContent).toContain('Pendiente de confirmar');
    expect(labels(el)).toEqual(expect.arrayContaining(['Sí, se realizó', 'No, necesitamos reprogramar']));
    expect(labels(el)).not.toContain('Cancelar horario');
    expect(labels(el)).not.toContain('Dejar reseña');
  });

  it('"Sí, se realizó" → confirmación accesible → POST /requests/:id/complete → Trabajo realizado + reseña', async () => {
    const { http, fixture, el } = await open(scheduled({ appointment: appointment(), completionDue: true }));
    button(el, 'Sí, se realizó')!.click();
    fixture.detectChanges();
    const d = dialog(el)!;
    expect(d.getAttribute('aria-labelledby')).toBe('appt-title');
    expect(d.textContent).toContain('Confirmar trabajo realizado');
    expect(d.textContent).toContain('vas a poder compartir tu experiencia con el profesional');
    expect(d.textContent).not.toMatch(/pag|conforme/i);
    expect(labels(d)).toEqual(['Volver', 'Sí, marcar como realizado']);
    button(d, 'Sí, marcar como realizado')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/complete` })
      .flush(scheduled({
        status: 'COMPLETED', completedAt: new Date().toISOString(), completedBy: 'CLIENT',
        appointment: appointment({ status: 'COMPLETED' }), canReview: true,
      }));
    await flush();
    // Los contadores se releen después de la acción ("pendiente de confirmar" baja).
    http.expectOne(summaryUrl).flush(summary(0));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Confirmaste que el trabajo se realizó.');
    expect(labels(el)).toContain('Dejar reseña');
    expect(labels(el)).not.toContain('Sí, se realizó');
    http.expectNone(`${API}/appointments/${APPT}/cancel`);
  });

  it('"No, necesitamos reprogramar" → "Volver a coordinar" → cancela la cita (no la solicitud) con el mismo profesional', async () => {
    const { http, fixture, el } = await open(scheduled({ appointment: appointment(), completionDue: true }));
    button(el, 'No, necesitamos reprogramar')!.click();
    fixture.detectChanges();
    const d = dialog(el)!;
    expect(d.textContent).toContain('Volver a coordinar');
    expect(d.textContent).toContain('El profesional seguirá seleccionado y podrá proponerte otro horario.');
    button(d, 'Necesitamos otro horario')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/appointments/${APPT}/cancel` })
      .flush(scheduled({ status: 'PROFESSIONAL_SELECTED', appointment: appointment({ status: 'CANCELLED', cancelledBy: 'CLIENT' }) }));
    await flush();
    http.expectOne(summaryUrl).flush(summary(0));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Profesional elegido');
    expect(el.textContent).toContain('Cancelaste el horario.');
    http.expectNone(`${API}/requests/${REQ_ID}/complete`);
    http.expectNone(`${API}/requests/${REQ_ID}/cancel`);
  });
});
