import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { API_URL } from '../api/api.config';
import { RequestsApiService } from '../api/requests-api.service';
import { authInterceptor } from '../auth/auth.interceptor';
import { professionalGuard } from '../auth/auth.guard';
import { AuthResponse, AuthUser } from '../models/auth';
import { Service, Zone } from '../models/category';
import { ProfessionalSummary } from '../models/professional';
import { Quote } from '../models/quote';
import { ProServiceRequest, ServiceRequest } from '../models/request';
import { REQUEST_STATUS_META, requestProgress } from '../models/request-status';
import { AuthStore } from './auth.store';
import { MyRequestsStore, SELECTED_CONFLICT } from './my-requests.store';
import { ProRequestsStore, QUOTE_EXISTS_MESSAGE } from './pro-requests.store';
import { DRAFT_TTL_MS } from './request-draft.storage';
import { RequestStore } from './request.store';
import { ZonesStore } from './zones.store';
import { MyRequestsPage } from '../../features/client/my-requests/my-requests-page';
import { RequestDetailPage } from '../../features/client/my-requests/request-detail/request-detail-page';
import { RequestFlowPage } from '../../features/client/request-flow/request-flow-page';
import { ProRequestsPage } from '../../features/pro/requests/pro-requests-page';
import { ProRequestDetailPage } from '../../features/pro/request-detail/pro-request-detail-page';
import { ProQuotePage, parseQuantity, previewTotalCents } from '../../features/pro/quote-builder/pro-quote-page';
import { othersText, proPersonalState, proRequestActions } from '../../features/pro/pro-ui';
import { amountScale } from '../utils/format';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const DRAFT_KEY = 'resuelve.requestDraft';
const REQ_ID = '11111111-1111-4111-8111-111111111111';
const PRO_1 = '22222222-2222-4222-8222-222222222222';
const PRO_2 = '33333333-3333-4333-8333-333333333333';
const ZONE: Zone = { id: '44444444-4444-4444-8444-444444444444', name: 'Centro', slug: 'centro', cityId: 'c' };
const ZONE_2: Zone = { id: '55555555-5555-4555-8555-555555555555', name: 'Villa Italia', slug: 'villa-italia', cityId: 'c' };
const SERVICE: Service = {
  id: '66666666-6666-4666-8666-666666666666', name: 'Plomería', slug: 'plomeria', categoryId: 'cat', requiresLicense: false,
};

const USER: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: '+54 249 400 1234',
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const PRO_USER: AuthUser = { ...USER, id: 'u-pro', firstName: 'Juan', professionalProfileId: PRO_1 };
const tokens = (n: number): AuthResponse => ({
  accessToken: `access.${n}.sig`, refreshToken: `refresh.${n}.sig`, expiresIn: 900, tokenType: 'Bearer',
});

const pro = (id: string, overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id, firstName: 'Ana', lastName: 'Prueba', displayName: 'Ana Prueba', avatarUrl: null, headline: null, bio: null,
  yearsExperience: 2, availableToday: true, averageResponseMinutes: null, averageRating: null, reviewsCount: 0,
  completedJobsCount: 0, services: [], coversEntireCity: false, zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  ...overrides,
});

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: REQ_ID,
  title: 'Pérdida bajo mesada',
  description: 'Gotea la pileta de la cocina desde ayer.',
  urgency: 'TODAY',
  status: 'WAITING_QUOTES',
  desiredDate: '2026-09-25',
  desiredTimeRange: null,
  service: { id: SERVICE.id, name: SERVICE.name, slug: SERVICE.slug },
  zone: { id: ZONE.id, name: ZONE.name, slug: ZONE.slug },
  photos: [],
  createdAt: '2026-09-25T13:00:00.000Z',
  updatedAt: '2026-09-25T13:00:00.000Z',
  exactAddress: null,
  selectedProfessionalId: null,
  acceptedQuoteId: null,
  completedAt: null,
  cancelledAt: null,
  appointment: null,
  invitations: [
    {
      id: 'inv-1', professionalId: PRO_1, status: 'PENDING', sentAt: '2026-09-25T13:00:00.000Z', respondedAt: null,
      professional: { id: PRO_1, displayName: 'Juan Prueba', avatarUrl: null, averageRating: null, reviewsCount: 0 },
    },
  ],
  ...overrides,
});

const quote = (id: string, professionalId: string, total: string, overrides: Partial<Quote> = {}): Quote => ({
  id, requestId: REQ_ID, professionalId,
  professional: { id: professionalId, displayName: `Pro ${id}`, avatarUrl: null, averageRating: 4.5, reviewsCount: 3 },
  description: 'Cambio de sifón', laborAmount: total, materialsAmount: '0.00', totalAmount: total, currency: 'ARS',
  availableFrom: null, validUntil: null, status: 'PENDING', items: [],
  createdAt: '2026-09-25T14:00:00.000Z', updatedAt: '2026-09-25T14:00:00.000Z',
  ...overrides,
});

const proRequest = (overrides: Partial<ProServiceRequest> = {}): ProServiceRequest => {
  const { exactAddress: _a, selectedProfessionalId: _s, acceptedQuoteId: _q, completedAt: _c, cancelledAt: _x, invitations: _i, appointment: _p, ...base } = request();
  return {
    ...base,
    completedAt: null,
    appointment: null,
    invitationStatus: 'PENDING',
    otherInvitedCount: 1,
    selectedByClient: false,
    client: { firstName: 'María', lastInitial: 'G' },
    contact: null,
    ...overrides,
  };
};

@Component({ template: '' })
class Blank {}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter(
        [
          { path: 'pro/dashboard', component: Blank },
          { path: 'pro/solicitudes', component: Blank, canActivate: [professionalGuard] },
          { path: '**', component: Blank },
        ],
        withComponentInputBinding(),
      ),
      { provide: API_URL, useValue: API },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), auth: TestBed.inject(AuthStore) };
}

const flush = () => new Promise((r) => setTimeout(r));

async function signIn(user: AuthUser = USER) {
  const auth = TestBed.inject(AuthStore);
  const http = TestBed.inject(HttpTestingController);
  auth.initialize();
  const done = auth.login({ email: user.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens(1));
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

/** Deja el borrador listo para enviar. */
function readyDraft(store: RequestStore) {
  store.setService(SERVICE);
  store.setZone(ZONE);
  store.updateDescription('Gotea la pileta de la cocina desde ayer.', false);
  store.askProfessionals([pro(PRO_1), pro(PRO_2)]);
}

const storedDraft = () => JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
const texts = (el: HTMLElement) => Array.from(el.querySelectorAll('a, button')).map((n) => (n.textContent ?? '').trim());
const button = (el: HTMLElement, label: string | RegExp) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    typeof label === 'string' ? (b.textContent ?? '').trim() === label : label.test((b.textContent ?? '').trim()),
  );

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

// ---------------------------------------------------------------------------
describe('zona real en el pedido', () => {
  it('el draft guarda id + nombre y el payload manda zoneId (UUID), no el nombre', () => {
    setup();
    const store = TestBed.inject(RequestStore);
    readyDraft(store);
    expect(store.draft().zone).toEqual({ id: ZONE.id, name: 'Centro' });
    const payload = store.buildPayload()!;
    expect(payload).toMatchObject({ serviceId: SERVICE.id, zoneId: ZONE.id, urgency: 'FLEXIBLE' });
    expect(JSON.stringify(payload)).not.toContain('"Centro"');
    expect(payload).not.toHaveProperty('status');
  });

  it('sin barrio real no se puede enviar', () => {
    setup();
    const store = TestBed.inject(RequestStore);
    readyDraft(store);
    store.draft.update((d) => ({ ...d, zone: null }));
    expect(store.issues()).toContain('zone');
    expect(store.buildPayload()).toBeNull();
  });

  it('el paso "barrio" muestra las zonas de GET /zones, sin lista inventada ni "Otro barrio"', async () => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    store.goToStep(2);
    const fixture = TestBed.createComponent(RequestFlowPage);
    await fixture.whenStable();
    http.expectOne(`${API}/zones?city=tandil`).flush([ZONE, ZONE_2]);
    for (const r of http.match(() => true)) r.flush([]);
    fixture.detectChanges();
    await fixture.whenStable();
    const radios = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="radio"]')).map((b) => b.textContent!.trim());
    expect(radios).toContain('Centro');
    expect(radios).toContain('Villa Italia');
    expect(fixture.nativeElement.textContent).not.toContain('Otro barrio');
    expect(fixture.nativeElement.textContent).not.toContain('Usar mi ubicación');
  });
});

// ---------------------------------------------------------------------------
describe('borrador en sessionStorage', () => {
  it('persiste solo lo no sensible (sin dirección, sin tokens)', () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    store.exactAddress.set('Alem 455');
    TestBed.tick();
    const saved = storedDraft();
    expect(saved.draft).toMatchObject({ zone: { id: ZONE.id, name: 'Centro' }, service: { id: SERVICE.id } });
    expect(saved.recipients.map((p: { id: string }) => p.id)).toEqual([PRO_1, PRO_2]);
    const raw = sessionStorage.getItem(DRAFT_KEY)!;
    expect(raw).not.toContain('Alem 455');
    expect(raw).not.toContain('access.');
    expect(raw).not.toContain('bio');
  });

  it('F5: un store nuevo restaura el borrador y los professionalIds reales', () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    TestBed.tick();
    const before = store.draft();

    TestBed.resetTestingModule();
    setup();
    const restored = TestBed.inject(RequestStore);
    expect(restored.draft()).toEqual(before);
    expect(restored.recipientIds()).toEqual([PRO_1, PRO_2]);
    expect(restored.exactAddress()).toBe('');
  });

  it('descarta un borrador vencido o inválido', () => {
    sessionStorage.setItem(DRAFT_KEY, '{no es json');
    setup();
    expect(TestBed.inject(RequestStore).draft().id).toBe('draft-inicial');
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    TestBed.resetTestingModule();
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    TestBed.tick();
    const saved = storedDraft();
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...saved, savedAt: Date.now() - DRAFT_TTL_MS - 1000 }));
    TestBed.resetTestingModule();
    setup();
    expect(TestBed.inject(RequestStore).draft().id).toBe('draft-inicial');
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    // Ids que no son UUID (p. ej. mocks viejos) tampoco se aceptan.
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...saved, savedAt: Date.now(), recipients: [{ id: 'martin', displayName: 'X' }] }));
    TestBed.resetTestingModule();
    setup();
    expect(TestBed.inject(RequestStore).recipientIds()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('RequestsApiService', () => {
  it('usa las rutas reales: create, mine (con status), detail, invitations y cancel', () => {
    const { http } = setup();
    const api = TestBed.inject(RequestsApiService);
    api.createRequest({ serviceId: SERVICE.id, zoneId: ZONE.id, title: 'T', description: 'D' }).subscribe();
    const create = http.expectOne({ method: 'POST', url: `${API}/requests` });
    expect(create.request.body).toEqual({ serviceId: SERVICE.id, zoneId: ZONE.id, title: 'T', description: 'D' });
    create.flush(request());

    api.getMyRequests({ status: 'QUOTES_RECEIVED', page: 2, pageSize: 20 }).subscribe();
    http.expectOne(`${API}/requests/mine?status=QUOTES_RECEIVED&page=2&pageSize=20`).flush({ items: [], page: 2, pageSize: 20, total: 0 });

    api.getRequestById(REQ_ID).subscribe();
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(request());

    api.inviteProfessionals(REQ_ID, [PRO_1]).subscribe();
    const invite = http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/invitations` });
    expect(invite.request.body).toEqual({ professionalIds: [PRO_1] });
    invite.flush(request());

    api.cancelRequest(REQ_ID).subscribe();
    http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/cancel` }).flush(request({ status: 'CANCELLED' }));
  });
});

// ---------------------------------------------------------------------------
describe('envío de la solicitud', () => {
  it('crea (DRAFT) + invita (WAITING_QUOTES), usa la respuesta real y limpia el borrador', async () => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    store.exactAddress.set('  Alem 455 ');
    TestBed.tick();
    expect(storedDraft()).not.toBeNull();

    const sending = store.send();
    // Doble click: no hay un segundo POST.
    expect(await store.send()).toBeNull();
    const create = http.expectOne({ method: 'POST', url: `${API}/requests` });
    expect(create.request.body).toMatchObject({ serviceId: SERVICE.id, zoneId: ZONE.id, exactAddress: 'Alem 455' });
    expect(create.request.body).not.toHaveProperty('status');
    create.flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    const invite = http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/invitations` });
    expect(invite.request.body).toEqual({ professionalIds: [PRO_1, PRO_2] });
    invite.flush(request());
    const sent = await sending;

    expect(sent?.status).toBe('WAITING_QUOTES');
    expect(store.lastCreated()?.id).toBe(REQ_ID);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(store.recipientIds()).toEqual([]);
    expect(store.exactAddress()).toBe('');
  });

  it('si la invitación falla, reintenta SOLO la invitación (nunca crea otra solicitud), incluso tras F5', async () => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    const first = store.send();
    http.expectOne({ method: 'POST', url: `${API}/requests` }).flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    http
      .expectOne(`${API}/requests/${REQ_ID}/invitations`)
      .flush({ statusCode: 422, code: 'PROFESSIONAL_NOT_ELIGIBLE', message: 'x' }, { status: 422, statusText: 'x' });
    expect(await first).toBeNull();
    expect(store.sendError()).toContain('ya no puede tomar este pedido');
    expect(store.pendingRequestId()).toBe(REQ_ID);
    TestBed.tick();
    expect(storedDraft().pendingRequestId).toBe(REQ_ID);

    // F5
    TestBed.resetTestingModule();
    const again = setup();
    const restored = TestBed.inject(RequestStore);
    expect(restored.pendingRequestId()).toBe(REQ_ID);
    restored.removeRecipient(PRO_2);
    const retry = restored.send();
    const patch = again.http.expectOne({ method: 'PATCH', url: `${API}/requests/${REQ_ID}` });
    patch.flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    again.http.expectOne(`${API}/requests/${REQ_ID}/invitations`).flush(request());
    expect((await retry)?.id).toBe(REQ_ID);
    again.http.expectNone({ method: 'POST', url: `${API}/requests` });
  });

  it('un 5xx no se reintenta solo', async () => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    readyDraft(store);
    const sending = store.send();
    http.expectOne({ method: 'POST', url: `${API}/requests` }).flush({}, { status: 503, statusText: 'x' });
    expect(await sending).toBeNull();
    http.expectNone(`${API}/requests`);
    expect(store.sendError()).toContain('No pudimos enviar');
    expect(store.pendingRequestId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('Mis solicitudes (real)', () => {
  async function openList() {
    const { http } = setup();
    await signIn();
    const fixture = TestBed.createComponent(MyRequestsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const mineUrl = (r: { url: string }) => r.url === `${API}/requests/mine`;

  it('loading → vacío con "Buscar un servicio"', async () => {
    const { http, fixture, el } = await openList();
    expect(el.querySelectorAll('.shimmer').length).toBeGreaterThan(0);
    http.expectOne(mineUrl).flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no hiciste ninguna solicitud.');
    expect(el.querySelector('a[href="/servicios"]')?.textContent).toContain('Buscar un servicio');
  });

  it('error → Reintentar vuelve a pedir; muestra estados reales del backend', async () => {
    const { http, fixture, el } = await openList();
    http.expectOne(mineUrl).flush({}, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar tus solicitudes.');
    Array.from<HTMLButtonElement>(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'))!.click();
    http.expectOne(mineUrl).flush({
      items: [request(), request({ id: 'r-2', status: 'QUOTES_RECEIVED', title: 'Saltan las térmicas' })],
      page: 1, pageSize: 20, total: 2,
    });
    fixture.detectChanges();
    expect(el.textContent).toContain(REQUEST_STATUS_META.WAITING_QUOTES.label);
    expect(el.textContent).toContain(REQUEST_STATUS_META.QUOTES_RECEIVED.label);
    expect(el.textContent).toContain('Enviada a 1 profesional');
    expect(el.querySelector(`a[href="/mis-solicitudes/${REQ_ID}"]`)).toBeTruthy();
  });

  it('el filtro de estado lo resuelve el backend (?status=)', async () => {
    const { http, fixture, el } = await openList();
    http.expectOne(mineUrl).flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    Array.from<HTMLButtonElement>(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelada')!.click();
    const req = http.expectOne(mineUrl);
    expect(req.request.params.get('status')).toBe('CANCELLED');
    req.flush({ items: [], page: 1, pageSize: 20, total: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('presupuestos: listar, comparar y aceptar (cliente)', () => {
  async function openDetail(req = request({ status: 'QUOTES_RECEIVED' }), quotes = [quote('q-1', PRO_1, '29001.00'), quote('q-2', PRO_2, '31000.50')]) {
    const { http } = setup();
    await signIn();
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    for (const r of http.match((r) => r.url.endsWith('/categories') || r.url.endsWith('/services'))) r.flush([]);
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(req);
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush(quotes);
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(MyRequestsStore) };
  }

  it('muestra los totales que manda el backend y ninguna "ganadora"', async () => {
    const { el } = await openDetail();
    expect(el.textContent).toContain('$ 29.001');
    expect(el.textContent).toContain('$ 31.001');
    expect(el.textContent).not.toMatch(/Más económico|Mejor precio|Recomendado/);
    expect(texts(el).filter((t) => t.startsWith('Elegir a'))).toHaveLength(2);
  });

  it('aceptar: confirma, llama al backend una sola vez y refresca con la respuesta', async () => {
    const { http, fixture, el, store } = await openDetail();
    const q = store.quotes()[0];
    const accepting = store.accept(q);
    expect(await store.accept(q)).toBe(false); // doble click
    expect(store.detail()?.status).toBe('QUOTES_RECEIVED'); // nada local antes de la respuesta
    const accept = http.expectOne({ method: 'POST', url: `${API}/quotes/q-1/accept` });
    accept.flush(request({ status: 'PROFESSIONAL_SELECTED', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1' }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([
      quote('q-1', PRO_1, '29001.00', { status: 'ACCEPTED' }),
      quote('q-2', PRO_2, '31000.50', { status: 'REJECTED' }),
    ]);
    expect(await accepting).toBe(true);
    fixture.detectChanges();
    expect(store.detail()?.status).toBe('PROFESSIONAL_SELECTED');
    expect(el.textContent).toContain('Profesional elegido');
    expect(el.textContent).toContain('Juan Prueba');
    expect(el.textContent).toContain('Ya compartimos tus datos de contacto únicamente con este profesional.');
    expect(texts(el).filter((t) => t.startsWith('Elegir a'))).toHaveLength(0);
  });

  it('después de elegir: "Aceptado" / "No elegido" y sin "Comparar presupuestos"', async () => {
    const { el } = await openDetail(
      request({ status: 'PROFESSIONAL_SELECTED', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1' }),
      [quote('q-1', PRO_1, '29001.00', { status: 'ACCEPTED' }), quote('q-2', PRO_2, '31000.50', { status: 'REJECTED' })],
    );
    const cards = Array.from(el.querySelectorAll('article'));
    expect(cards[0].textContent).toContain('Aceptado');
    expect(cards[1].textContent).toContain('No elegido');
    expect(texts(el)).not.toContain('Comparar presupuestos');
    expect(el.querySelector('#quotes-compare')).toBeNull();
    expect(texts(el).filter((t) => t.startsWith('Elegir a'))).toHaveLength(0);
    // Invitados como bloque secundario plegable.
    expect(el.querySelector('details summary')?.textContent).toContain('Profesionales invitados');
  });

  it('antes de elegir se puede comparar', async () => {
    const { el } = await openDetail();
    expect(texts(el)).toContain('Comparar presupuestos');
  });

  it('confirmación en diálogo: nombre, monto y privacidad; "Volver" no llama al backend', async () => {
    const { http, fixture, el } = await openDetail();
    button(el, 'Elegir a Pro')!.click();
    fixture.detectChanges();
    const dialog = el.querySelector<HTMLDialogElement>('dialog[open]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-labelledby')).toBe('accept-title');
    expect(dialog.querySelector('#accept-title')?.textContent).toContain('Confirmar profesional');
    expect(dialog.textContent).toContain('Pro q-1');
    expect(dialog.textContent).toContain('$ 29.001');
    expect(dialog.textContent).toContain('Al confirmar, compartiremos tu teléfono y la dirección del trabajo únicamente con este profesional.');
    expect(texts(dialog)).toContain('Sí, elegir profesional');
    expect(texts(dialog).some((t) => t === 'Sí, aceptar')).toBe(false);
    button(dialog, 'Volver')!.click();
    fixture.detectChanges();
    expect(el.querySelector('dialog[open]')).toBeNull();
    http.expectNone(`${API}/quotes/q-1/accept`);

    button(el, 'Elegir a Pro')!.click();
    fixture.detectChanges();
    button(el.querySelector('dialog[open]')!, 'Sí, elegir profesional')!.click();
    fixture.detectChanges();
    const accept = http.expectOne({ method: 'POST', url: `${API}/quotes/q-1/accept` });
    accept.flush(request({ status: 'PROFESSIONAL_SELECTED', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1' }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([quote('q-1', PRO_1, '29001.00', { status: 'ACCEPTED' })]);
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('dialog[open]')).toBeNull();
  });

  it('progreso de 4 pasos derivado del estado real', async () => {
    const labels = (s: Parameters<typeof requestProgress>[0]) => requestProgress(s)!.map((p) => `${p.state}:${p.label}`);
    expect(labels('QUOTES_RECEIVED')).toEqual([
      'done:Solicitud enviada', 'done:Presupuestos recibidos', 'current:Elegir profesional', 'todo:Coordinar trabajo',
    ]);
    expect(labels('PROFESSIONAL_SELECTED')).toEqual([
      'done:Solicitud enviada', 'done:Presupuestos recibidos', 'done:Profesional elegido', 'current:Coordinar trabajo',
    ]);
    expect(labels('WAITING_QUOTES')[1]).toBe('current:Esperando presupuestos');
    expect(requestProgress('CANCELLED')).toBeNull();
    const { el } = await openDetail();
    expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('Elegir profesional');
  });

  it('aceptación concurrente: 409 → "ya tiene un profesional seleccionado" y datos refrescados', async () => {
    const { http, store } = await openDetail();
    const accepting = store.accept(store.quotes()[1]);
    http
      .expectOne(`${API}/quotes/q-2/accept`)
      .flush({ statusCode: 409, code: 'INVALID_QUOTE_STATE', message: 'x' }, { status: 409, statusText: 'x' });
    await flush();
    http
      .expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` })
      .flush(request({ status: 'PROFESSIONAL_SELECTED', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1' }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([quote('q-1', PRO_1, '29001.00', { status: 'ACCEPTED' })]);
    expect(await accepting).toBe(false);
    expect(store.actionError()).toBe(SELECTED_CONFLICT);
    expect(store.detail()?.status).toBe('PROFESSIONAL_SELECTED');
  });

  it('cancelar solo se ofrece en estados válidos y usa la respuesta del backend', async () => {
    const { http, fixture, el, store } = await openDetail(request(), []);
    expect(texts(el)).toContain('Cancelar solicitud');
    const cancelling = store.cancel();
    http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/cancel` }).flush(request({ status: 'CANCELLED', cancelledAt: '2026-09-25T15:00:00.000Z' }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    expect(await cancelling).toBe(true);
    fixture.detectChanges();
    expect(texts(el)).not.toContain('Cancelar solicitud');
    expect(el.textContent).toContain(REQUEST_STATUS_META.CANCELLED.label);
  });
});

// ---------------------------------------------------------------------------
describe('área profesional (real)', () => {
  it('sin professionalProfileId no entra a /pro/solicitudes (guard)', async () => {
    setup();
    await signIn(USER);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/pro/solicitudes');
    expect(router.url).toBe('/soy-profesional');
  });

  it('invitado → /ingresar con returnUrl; con perfil profesional entra', async () => {
    const { auth, http } = setup();
    auth.initialize();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/pro/solicitudes');
    expect(router.url).toBe('/ingresar?returnUrl=%2Fpro%2Fsolicitudes');
    const done = auth.login({ email: PRO_USER.email, password: 'una-clave-larga' });
    http.expectOne(`${API}/auth/login`).flush(tokens(2));
    await flush();
    http.expectOne(`${API}/auth/me`).flush(PRO_USER);
    await done;
    await router.navigateByUrl('/pro/solicitudes');
    expect(router.url).toBe('/pro/solicitudes');
  });

  it('listado real: pestañas = ?status= del backend', async () => {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProRequestsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = http.expectOne((r) => r.url === `${API}/pro/requests` && r.params.get('status') === 'PENDING' && r.params.get('pageSize') === '20');
    first.flush({ items: [proRequest()], page: 1, pageSize: 20, total: 1 });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Pérdida bajo mesada');
    expect(el.textContent).toContain('María G.');
    Array.from<HTMLButtonElement>(el.querySelectorAll('[role="tab"]')).find((b) => b.textContent?.includes('Presupuestadas'))!.click();
    http.expectOne((r) => r.url === `${API}/pro/requests` && r.params.get('status') === 'QUOTED').flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no enviaste presupuestos.');
    Array.from<HTMLButtonElement>(el.querySelectorAll('[role="tab"]')).find((b) => b.textContent?.includes('Nuevas'))!.click();
    http.expectOne((r) => r.url === `${API}/pro/requests` && r.params.get('status') === 'PENDING').flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('No tenés solicitudes nuevas.');
    expect(el.textContent).toContain('Cuando un cliente te pida presupuesto, va a aparecer acá.');
  });

  it('"También se envió a…": singular y plural', () => {
    setup();
    expect(othersText({ otherInvitedCount: 1 })).toBe('También se envió a 1 profesional más.');
    expect(othersText({ otherInvitedCount: 2 })).toBe('También se envió a 2 profesionales más.');
    expect(othersText({ otherInvitedCount: 0 })).toBe('Solo se envió a vos.');
  });

  it('estado personal: presupuesto enviado ≠ ganador ≠ no elegido (mismo estado global)', () => {
    setup();
    expect(proPersonalState({ invitationStatus: 'QUOTED', status: 'QUOTES_RECEIVED', selectedByClient: false }).title).toBe('Presupuesto enviado');
    const won = proPersonalState({ invitationStatus: 'SELECTED', status: 'PROFESSIONAL_SELECTED', selectedByClient: true });
    const lost = proPersonalState({ invitationStatus: 'NOT_SELECTED', status: 'PROFESSIONAL_SELECTED', selectedByClient: false });
    expect(won.title).toBe('Te eligieron');
    expect(won.global).toBe('Profesional seleccionado');
    expect(lost.title).toBe('El cliente eligió otro presupuesto');
    expect(lost.global).toBeNull();
  });

  async function openProDetail(r: ProServiceRequest) {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(r);
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('estándar: "Enviar presupuesto" + "No disponible"; sin dirección ni teléfono antes de la elección', async () => {
    const { el } = await openProDetail(proRequest());
    const labels = texts(el);
    expect(labels.filter((t) => t === 'Enviar presupuesto')).toHaveLength(2); // desktop + mobile
    expect(labels).toContain('No disponible');
    expect(labels.some((t) => /^Aceptar|Tomar trabajo/.test(t))).toBe(false);
    expect(el.textContent).not.toContain('400 1234');
    expect(el.textContent).not.toContain('Te eligieron');
    expect(el.textContent).toContain('se comparten solo si elige tu presupuesto');
  });

  it('urgente: "Tomar trabajo" (nunca "Aceptar")', async () => {
    const { el } = await openProDetail(proRequest({ urgency: 'URGENT' }));
    const labels = texts(el);
    expect(labels.filter((t) => t === 'Tomar trabajo')).toHaveLength(2);
    expect(labels.some((t) => /^Aceptar/.test(t))).toBe(false);
    expect(proRequestActions({ invitationStatus: 'QUOTED', urgency: 'URGENT', status: 'QUOTES_RECEIVED' })).toBeNull();
    expect(proRequestActions({ invitationStatus: 'PENDING', urgency: 'URGENT', status: 'CANCELLED' })).toBeNull();
  });

  it('elegido: muestra el contacto que manda el backend', async () => {
    const { el } = await openProDetail(
      proRequest({
        status: 'PROFESSIONAL_SELECTED', invitationStatus: 'SELECTED', selectedByClient: true,
        contact: { fullName: 'María González', phone: '+54 249 400 1234', exactAddress: 'Alem 455' },
      }),
    );
    expect(el.textContent).toContain('Alem 455');
    expect(el.textContent).toContain('+54 249 400 1234');
    expect(el.querySelector('a[href="tel:+54 249 400 1234"]')).not.toBeNull();
    expect(el.textContent).toContain('Te eligieron');
    expect(el.textContent).toContain('Ya podés ver los datos de contacto para coordinar el trabajo.');
    expect(el.textContent).toContain('Datos para coordinar');
    expect(el.textContent).toContain('Estado de la solicitud: Profesional seleccionado');
    expect(texts(el)).not.toContain('Enviar presupuesto');
  });

  it('no elegido: "El cliente eligió otro presupuesto", sin datos del cliente ni CTA', async () => {
    const { el } = await openProDetail(proRequest({ status: 'PROFESSIONAL_SELECTED', invitationStatus: 'NOT_SELECTED' }));
    expect(el.textContent).toContain('El cliente eligió otro presupuesto');
    expect(el.textContent).toContain('No necesitás hacer nada más con esta solicitud.');
    expect(el.textContent).not.toContain('Te eligieron');
    expect(el.textContent).not.toContain('Profesional seleccionado');
    expect(el.textContent).not.toContain('400 1234');
    expect(el.querySelector('a[href^="tel:"]')).toBeNull();
    expect(texts(el).some((t) => /Enviar presupuesto|Tomar trabajo|No disponible/.test(t))).toBe(false);
  });

  it('"No disponible" persiste en el backend (POST decline)', async () => {
    const { http } = await openProDetail(proRequest());
    const store = TestBed.inject(ProRequestsStore);
    const declining = store.decline(REQ_ID);
    http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/decline` }).flush(proRequest({ invitationStatus: 'DECLINED' }));
    expect(await declining).toBe(true);
    expect(store.detail()?.invitationStatus).toBe('DECLINED');
  });
});

// ---------------------------------------------------------------------------
describe('presupuesto del profesional', () => {
  it('el total visual es solo vista previa (centavos) y el payload no manda totalAmount', () => {
    setup();
    expect(previewTotalCents(20000, 0, [{ quantity: 2, unitPrice: 4500.5 }])).toBe(2_900_100);
    expect(previewTotalCents(0.1, 0.2, [])).toBe(30); // sin errores de float
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('1,555')).toBeNaN();
  });

  async function openQuote(r = proRequest()) {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProQuotePage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(r);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      description: { set(v: string): void };
      labor: { set(v: number): void };
      materials: { set(v: number): void };
      send(): Promise<void>;
    };
    return { http, fixture, page, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(ProRequestsStore) };
  }

  it('crea el presupuesto y muestra el total que devuelve el servidor', async () => {
    const { http, fixture, page, el } = await openQuote();
    page.description.set('Cambio de sifón y flexibles');
    page.labor.set(20000);
    page.materials.set(5000);
    const sending = page.send();
    const post = http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` });
    expect(post.request.body).toMatchObject({ description: 'Cambio de sifón y flexibles', laborAmount: 20000, materialsAmount: 5000 });
    expect(post.request.body).not.toHaveProperty('totalAmount');
    // El servidor es la autoridad (acá, otro total a propósito).
    post.flush(quote('q-9', PRO_1, '25000.50', { laborAmount: '20000.00', materialsAmount: '5000.50' }));
    await sending;
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({ invitationStatus: 'QUOTED' }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Presupuesto enviado');
    expect(el.textContent).toContain('$ 25.001');
    expect(el.textContent).toContain('¿Qué sigue?');
    expect(el.textContent).not.toContain('Total estimado'); // ya es el total del servidor
    expect(texts(el)).toEqual(expect.arrayContaining(['Ver solicitud', 'Volver a solicitudes']));
  });

  it('montos: separador de miles al escribir, escala y aviso de monto alto (sin bloquear)', async () => {
    const { http, fixture, page, el } = await openQuote();
    const input = el.querySelector<HTMLInputElement>('input[aria-describedby="labor-scale"]')!;
    input.value = '304000000';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('304.000.000');
    expect(el.textContent).toContain('Total estimado');
    expect(el.textContent).toContain('≈ 304 millones');
    expect(el.textContent).toContain('Es un monto alto. Revisá que no sobre ningún cero antes de enviar.');
    page.description.set('Cambio de sifón y flexibles');
    const sending = page.send();
    const post = http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` });
    expect(post.request.body.laborAmount).toBe(304_000_000); // número, no el texto formateado
    post.flush(quote('q-9', PRO_1, '304000000.00'));
    await sending;
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({ invitationStatus: 'QUOTED' }));
    expect(amountScale(999_999)).toBeNull();
    expect(amountScale(1_000_000)).toBe('≈ 1 millón');
    expect(amountScale(1_500_000)).toBe('≈ 1,5 millones');
  });

  it('409 QUOTE_ALREADY_EXISTS → "Ya enviaste un presupuesto…" y no permite otro', async () => {
    const { http, fixture, page, el, store } = await openQuote();
    page.description.set('Cambio de sifón y flexibles');
    page.labor.set(1000);
    const sending = page.send();
    http
      .expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` })
      .flush({ statusCode: 409, code: 'QUOTE_ALREADY_EXISTS', message: 'x' }, { status: 409, statusText: 'x' });
    await sending;
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({ invitationStatus: 'QUOTED' }));
    fixture.detectChanges();
    expect(store.quoteError()).toBe(QUOTE_EXISTS_MESSAGE);
    // La invitación ya está QUOTED: no queda formulario para mandar otro.
    expect(texts(el).some((t) => t.startsWith('Enviar presupuesto'))).toBe(false);
  });

  it('no envía nada si el total es 0 o falta descripción', async () => {
    const { http, page } = await openQuote();
    await page.send();
    http.expectNone(`${API}/pro/requests/${REQ_ID}/quote`);
  });
});
