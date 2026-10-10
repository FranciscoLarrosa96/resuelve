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
import { OwnProfessional } from '../models/pro-profile';
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
import { ProRequestsPage, initialProRequestsTab } from '../../features/pro/requests/pro-requests-page';
import { ProRequestDetailPage } from '../../features/pro/request-detail/pro-request-detail-page';
import { ProQuotePage, parseQuantity, previewTotalCents } from '../../features/pro/quote-builder/pro-quote-page';
import { othersText, proPersonalState, proRequestActions, proRequestActivity, PRO_STATE_TONES } from '../../features/pro/pro-ui';
import { amountScale } from '../utils/format';
import { testNeighborhoodsUrl, useTestLocality } from './locality.testing';

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
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
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
  verifications: { identity: false, phone: false, license: false, licenses: [] }, pro: false,
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
  completedBy: null,
  cancelledAt: null,
  appointment: null, completionDue: false, canComplete: false, review: null, canReview: false,
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
  note: null, estimatedDuration: null,
  availableFrom: null, validUntil: null, status: 'PENDING', items: [],
  createdAt: '2026-09-25T14:00:00.000Z', updatedAt: '2026-09-25T14:00:00.000Z',
  ...overrides,
});

const proRequest = (overrides: Partial<ProServiceRequest> = {}): ProServiceRequest => {
  const { exactAddress: _a, selectedProfessionalId: _s, acceptedQuoteId: _q, completedAt: _c, cancelledAt: _x, invitations: _i, appointment: _p, review: _r, canReview: _cr, ...base } = request();
  return {
    ...base,
    completedAt: null,
    appointment: null,
    invitationStatus: 'PENDING',
    otherInvitedCount: 1,
    selectedByClient: false,
    ownQuote: null,
    client: { firstName: 'María', lastInitial: 'G' },
    contact: null,
    ...overrides,
  };
};

@Component({ template: '' })
class Blank {}

function setup() {
  useTestLocality();
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
  // Profesionales reales que pueden recibirlo: ofrecen el servicio y trabajan en todo Tandil.
  const offers = { services: [{ id: SERVICE.id, name: SERVICE.name, slug: SERVICE.slug }], coversEntireCity: true };
  store.askProfessionals([pro(PRO_1, offers), pro(PRO_2, offers)], 'DISCOVERY');
}

const storedDraft = () => JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
const texts = (el: HTMLElement) => Array.from(el.querySelectorAll('a, button')).map((n) => (n.textContent ?? '').trim());
const button = (el: HTMLElement, label: string | RegExp) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    typeof label === 'string' ? (b.textContent ?? '').trim() === label : label.test((b.textContent ?? '').trim()),
  );

/** /pro/me mínimo: lo que leen las pantallas de solicitudes (plan y cupo Free total). */
const usage = (used: number, limit: number | null = 5) => ({
  used,
  limit,
  remaining: limit === null ? null : Math.max(0, limit - used),
});
const OFFER = {
  eligible: true,
  offerCode: 'PRO_FIRST_MONTH_20',
  discountPercent: 20,
  appliesToCycles: 1,
  basePriceArs: 15000,
  discountedPriceArs: 12000,
  reserved: false,
} as const;
const NO_OFFER = { eligible: false, reason: 'USAGE_BELOW_THRESHOLD' } as const;
const ownMe = (u = usage(0), pro = false, offer: object | undefined = undefined) =>
  ({
    ...(offer ? { proIntroOffer: offer } : {}),
    id: PRO_1,
    plan: {
      tier: pro ? 'PRO' : 'FREE',
      expiresAt: null,
      entitlements: { canSendUnlimitedQuotes: pro, canBeFeatured: pro, canUseAdvancedAnalytics: pro, canSeeExposureAnalytics: pro, canUseQuoteTemplates: false, portfolioPhotoLimit: pro ? 20 : 5 },
    },
    quoteUsage: u,
  }) as unknown as OwnProfessional;
const PLANS = { free: { quoteLimit: 5 }, pro: { monthlyPriceArs: 15000, selfServe: false, features: { quoteTemplates: false } } };

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  const http = TestBed.inject(HttpTestingController);
  // Las pantallas pro leen el plan y el cupo; los tests que no los miran los responden acá.
  for (const r of http.match(`${API}/pro/me`)) r.flush(ownMe());
  for (const r of http.match(`${API}/plans`)) r.flush(PLANS);
  http.verify({ ignoreCancelled: true });
});

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
    http.expectOne(testNeighborhoodsUrl(API)).flush([ZONE, ZONE_2]);
    for (const r of http.match(() => true)) r.flush([]);
    fixture.detectChanges();
    await fixture.whenStable();
    // Autocompletado: al enfocar ofrece todas las zonas reales (y solo esas).
    fixture.nativeElement.querySelector('input[role="combobox"]').dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    const options = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[role="option"]')).map((b) => b.textContent!.trim());
    expect(options).toEqual(['Centro', 'Villa Italia']);
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
    expect(invite.request.body).toMatchObject({ professionalIds: [PRO_1], targeted: false, attributionSource: 'OTHER' });
    invite.flush(request());

    api.cancelRequest(REQ_ID).subscribe();
    http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/cancel` }).flush(request({ status: 'CANCELLED' }));
  });
});

// ---------------------------------------------------------------------------
describe('envío de la solicitud', () => {
  it('un único destinatario elegido en discovery envía targeted=false', async () => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    store.askProfessionals([pro(PRO_1)], 'DISCOVERY');

    const sending = store.send();
    http.expectOne({ method: 'POST', url: `${API}/requests` }).flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    const invite = http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/invitations` });
    expect(invite.request.body).toMatchObject({
      professionalIds: [PRO_1],
      targeted: false,
      attributionSource: 'MARKETPLACE_DISCOVERY',
    });
    expect(invite.request.body.attributionSessionKey).toMatch(/^[A-Fa-f0-9]{32}$/);
    invite.flush(request());
    expect((await sending)?.status).toBe('WAITING_QUOTES');
  });

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
    expect(invite.request.body).toMatchObject({
      professionalIds: [PRO_1, PRO_2],
      targeted: false,
      attributionSource: 'MARKETPLACE_DISCOVERY',
    });
    expect(invite.request.body.attributionSessionKey).toMatch(/^[A-Fa-f0-9]{32}$/);
    invite.flush(request());
    const sent = await sending;

    expect(sent?.status).toBe('WAITING_QUOTES');
    expect(store.lastCreated()?.id).toBe(REQ_ID);
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(store.recipientIds()).toEqual([]);
    expect(store.exactAddress()).toBe('');
  });

  it.each(['MARKETPLACE', 'PUBLIC_PROFILE', 'PROFILE_QR', 'PROFILE_SHARE', 'REFERRAL'] as const)(
    'reintento a varios tras F5 conserva el pedido y excluye acquisitionSource del PATCH (%s)', async (source) => {
    const { http } = setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    readyDraft(store);
    store.acquisitionSource.set(source);
    const first = store.send();
    const create = http.expectOne({ method: 'POST', url: `${API}/requests` });
    expect(create.request.body.acquisitionSource).toBe(source);
    create.flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    http
      .expectOne(`${API}/requests/${REQ_ID}/invitations`)
      .flush({ statusCode: 422, code: 'PROFESSIONAL_NOT_ELIGIBLE', message: 'x' }, { status: 422, statusText: 'x' });
    expect(await first).toBeNull();
    expect(store.sendError()).toContain('ya no puede recibir este pedido');
    expect(store.pendingRequestId()).toBe(REQ_ID);
    TestBed.tick();
    expect(storedDraft().pendingRequestId).toBe(REQ_ID);

    // F5
    TestBed.resetTestingModule();
    const again = setup();
    const restored = TestBed.inject(RequestStore);
    expect(restored.pendingRequestId()).toBe(REQ_ID);
    expect(restored.acquisitionSource()).toBe(source);
    restored.exactAddress.set('  Alem 455  ');
    const retry = restored.send();
    const patch = again.http.expectOne({ method: 'PATCH', url: `${API}/requests/${REQ_ID}` });
    expect(patch.request.body).not.toHaveProperty('acquisitionSource');
    expect(patch.request.body).toMatchObject({ serviceId: SERVICE.id, zoneId: ZONE.id,
      description: 'Gotea la pileta de la cocina desde ayer.', exactAddress: 'Alem 455' });
    patch.flush(request({ status: 'DRAFT', invitations: [] }));
    await flush();
    const invite = again.http.expectOne(`${API}/requests/${REQ_ID}/invitations`);
    expect(invite.request.body.professionalIds).toEqual([PRO_1, PRO_2]);
    invite.flush(request());
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

  it('filtros agrupados (pocos) y los resuelve el backend (?group=)', async () => {
    const { http, fixture, el } = await openList();
    http.expectOne(mineUrl).flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    const pills = Array.from<HTMLButtonElement>(el.querySelectorAll('[aria-label="Filtrar por estado"] button'));
    expect(pills.map((b) => b.textContent?.trim())).toEqual([
      'Todas', 'Activas', 'Presupuestos', 'Por coordinar', 'Agendadas', 'Realizadas', 'Canceladas',
    ]);
    pills.find((b) => b.textContent?.trim() === 'Por coordinar')!.click();
    const req = http.expectOne(mineUrl);
    expect(req.request.params.get('group')).toBe('COORDINATING');
    expect(req.request.params.has('status')).toBe(false);
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

  it('el cliente despliega partidas, aclaraciones y duración del presupuesto', async () => {
    const detailed = quote('q-detail', PRO_1, '30000.00', {
      note: 'Incluye retiro de residuos.',
      estimatedDuration: '1 día',
      laborAmount: '20000.00',
      materialsAmount: '10000.00',
      items: [{ id: 'item-1', description: 'Cable reforzado', quantity: '2.00', unitPrice: '5000.00', subtotal: '10000.00', sortOrder: 0 }],
    });
    const { fixture, el } = await openDetail(request({ status: 'QUOTES_RECEIVED' }), [detailed]);
    const card = el.querySelector('article')!;
    const disclosure = card.querySelector('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('summary')?.textContent).toContain('Ver detalle del presupuesto');
    (disclosure.querySelector('summary') as HTMLElement).click();
    fixture.detectChanges();
    expect(disclosure.open).toBe(true);
    expect(disclosure.textContent).toContain('Cable reforzado');
    expect(disclosure.textContent).toContain('Incluye retiro de residuos.');
    expect(card.textContent).toContain('Duración estimada: 1 día');
  });

  it('muestra los cupos reales de propuestas recibidas', async () => {
    const { el } = await openDetail(request({
      status: 'QUOTES_RECEIVED',
      quoteCapacity: { activeQuoteCount: 2, maxActiveQuotes: 5, remainingQuoteSlots: 3, slotsFull: false },
    }));
    expect(el.textContent).toContain('2 de 5 propuestas recibidas');
    expect(el.textContent).toContain('Quedan 3 lugares.');
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
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${API}/pro/requests` && !r.params.has('status')).flush({ items: [], page: 1, pageSize: 20, total: 0 });
    fixture.detectChanges();
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Todas');
    expect(el.textContent).toContain('Todavía no recibiste solicitudes.');
    expect(initialProRequestsTab(0)).toBe('ALL');
    expect(initialProRequestsTab(1)).toBe('PENDING');
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

  it('estados visuales y actividad usan solo hechos fechados', () => {
    setup();
    expect(PRO_STATE_TONES.waiting.icon).toBe('clock');
    expect(proRequestActivity(proRequest())).toEqual([{
      label: 'Solicitud recibida', at: '2026-09-25T13:00:00.000Z', icon: 'clock',
    }]);
    const sent = quote('q-activity', PRO_1, '25000.00', { updatedAt: '2026-09-26T14:00:00.000Z' });
    expect(proRequestActivity(proRequest({ status: 'QUOTES_RECEIVED', invitationStatus: 'QUOTED', ownQuote: sent })).map((event) => event.label))
      .toEqual(['Solicitud recibida', 'Presupuesto enviado', 'Presupuesto editado']);
    expect(proRequestActivity(proRequest({ status: 'CANCELLED' })).map((event) => event.label))
      .toEqual(['Solicitud recibida']);
    expect(proRequestActivity(proRequest({
      status: 'PROFESSIONAL_SELECTED', invitationStatus: 'SELECTED', selectedByClient: true,
      ownQuote: { ...sent, status: 'ACCEPTED' },
    })).map((event) => event.label)).toEqual(['Solicitud recibida', 'Presupuesto enviado']);
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
    expect(el.querySelector('[data-testid="pro-request-layout"]')?.className).toContain('max-w-295');
    expect(el.querySelector('[data-testid="pro-request-grid"]')?.className).toContain('lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]');
    expect(el.querySelector('[data-testid="pro-request-mobile-status"]')?.textContent).toContain('Nueva solicitud');
  });

  it('cancelada: estado junto al título en mobile, sin acciones ni columna sticky', async () => {
    const { el } = await openProDetail(proRequest({ status: 'CANCELLED' }));
    expect(el.querySelector('[data-testid="pro-request-mobile-status"]')?.textContent).toContain('El cliente canceló la solicitud');
    expect(el.querySelector('[data-testid="pro-request-mobile-status"]')?.textContent).toContain('No necesitás hacer nada más');
    expect(el.querySelector('[aria-label="Estado y acciones"]')?.className).not.toContain('lg:sticky');
    expect(texts(el)).not.toContain('Enviar presupuesto');
    expect(texts(el)).not.toContain('No disponible');
  });

  it('realizada: estado y fecha real junto al título, sin acciones ni columna sticky', async () => {
    const { el } = await openProDetail(proRequest({
      status: 'COMPLETED', invitationStatus: 'SELECTED', selectedByClient: true,
      completedAt: '2026-09-26T13:10:00.000Z',
    }));
    const mobileState = el.querySelector('[data-testid="pro-request-mobile-status"]');
    expect(mobileState?.textContent).toContain('Trabajo realizado');
    expect(mobileState?.textContent).toContain('26 sep');
    expect(mobileState?.textContent).toContain('Qué sigue');
    expect(mobileState?.textContent).toContain('registrado como realizado');
    expect(el.querySelector('[aria-label="Estado y acciones"]')?.className).not.toContain('lg:sticky');
    expect(texts(el)).not.toContain('Enviar presupuesto');
  });

  it('delay Free informa el desbloqueo real y ofrece responder ahora con PRO', async () => {
    const availableToProfessionalAt = '2026-09-29T03:00:00.000Z';
    const { el } = await openProDetail(proRequest({
      opportunity: {
        blocked: false,
        targeted: false,
        delayed: true,
        availableToProfessionalAt,
        actionable: false,
        activeQuoteCount: 2,
        maxActiveQuotes: 5,
        remainingQuoteSlots: 3,
        slotsFull: false,
        attributionSource: 'MARKETPLACE_DISCOVERY',
      },
    }));
    expect(el.textContent).toContain('Disponible para Free a partir de');
    expect(el.querySelector('a[href="/pro/plan"]')?.textContent).toContain('Responder ahora con PRO');
  });

  it('si ya se llenaron los cupos, muestra cerrado aunque el delay todavía corra', async () => {
    const { el } = await openProDetail(proRequest({
      opportunity: {
        blocked: false,
        targeted: false,
        delayed: true,
        availableToProfessionalAt: '2026-09-29T03:00:00.000Z',
        actionable: false,
        activeQuoteCount: 5,
        maxActiveQuotes: 5,
        remainingQuoteSlots: 0,
        slotsFull: true,
        attributionSource: 'MARKETPLACE_DISCOVERY',
      },
    }));
    expect(el.textContent).toContain('Esta solicitud ya recibió suficientes propuestas.');
    expect(el.textContent).not.toContain('Disponible para Free a partir de');
    expect(el.querySelector('a[href="/pro/plan"]')).toBeNull();
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

  it('quote pendiente muestra "Editar presupuesto" en el detalle profesional', async () => {
    const ownQuote = quote('q-edit', PRO_1, '25000.00');
    const { el } = await openProDetail(proRequest({
      status: 'QUOTES_RECEIVED',
      invitationStatus: 'QUOTED',
      ownQuote,
    }));
    const edit = [...el.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent?.trim() === 'Editar presupuesto');
    expect(edit?.getAttribute('href')).toBe(`/pro/solicitudes/${REQ_ID}/presupuesto/q-edit`);
    const summary = el.querySelector('[data-testid="own-quote-summary"]');
    expect(summary?.textContent).toContain('Cambio de sifón');
    expect(summary?.textContent).toContain('25.000');
    expect(el.querySelector('[data-testid="request-activity"]')?.textContent).toContain('Presupuesto enviado');
    expect(el.querySelector('[aria-label="Estado y acciones"] a[href$="/presupuesto/q-edit"]')).not.toBeNull();
  });

  it('quote editado muestra datos actuales y el evento de edición real', async () => {
    const { el } = await openProDetail(proRequest({
      status: 'QUOTES_RECEIVED', invitationStatus: 'QUOTED',
      ownQuote: quote('q-edited', PRO_1, '31000.00', {
        description: 'Cambio de sifón y flexibles', laborAmount: '26000.00', materialsAmount: '5000.00',
        updatedAt: '2026-09-26T14:00:00.000Z',
      }),
    }));
    const summary = el.querySelector('[data-testid="own-quote-summary"]')!;
    expect(summary.textContent).toContain('31.000');
    expect(summary.textContent).toContain('Cambio de sifón y flexibles');
    const activity = el.querySelector('[data-testid="request-activity"]')!;
    expect(activity.textContent).toContain('Presupuesto editado');
    expect(activity.className).toContain('rounded-2xl');
    expect(activity.querySelectorAll('ol > li')).toHaveLength(3);
    expect(activity.textContent).not.toContain('Pendiente de decisión');
  });

  it('quote aceptada oculta "Editar presupuesto" en el detalle profesional', async () => {
    const { el } = await openProDetail(proRequest({
      status: 'PROFESSIONAL_SELECTED',
      invitationStatus: 'SELECTED',
      selectedByClient: true,
      ownQuote: quote('q-accepted', PRO_1, '25000.00', { status: 'ACCEPTED' }),
    }));
    expect(texts(el)).not.toContain('Editar presupuesto');
    expect(el.querySelector('[data-testid="own-quote-summary"]')?.textContent).toContain('25.000');
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

  async function openQuote(r = proRequest(), quoteId?: string) {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProQuotePage);
    fixture.componentRef.setInput('id', REQ_ID);
    if (quoteId) fixture.componentRef.setInput('quoteId', quoteId);
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

  it('precarga el presupuesto propio y guarda cambios con PATCH sobre la misma quote', async () => {
    const saved = quote('q-edit', PRO_1, '25000.00', {
      description: 'Reemplazo de sifón y flexibles',
      laborAmount: '20000.00',
      materialsAmount: '5000.00',
      items: [{ id: 'item-1', description: 'Sifón', quantity: '2.00', unitPrice: '2500.00', subtotal: '5000.00', sortOrder: 0 }],
    });
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProQuotePage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.componentRef.setInput('quoteId', 'q-edit');
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({
      status: 'QUOTES_RECEIVED',
      invitationStatus: 'QUOTED',
      ownQuote: saved,
    }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as { send(): Promise<void> };
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Reemplazo de sifón y flexibles');
    expect(el.querySelector<HTMLInputElement>('[aria-describedby="labor-scale"]')!.value).toBe('20.000');
    expect(el.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!.value).toBe('2.00');
    expect([...el.querySelectorAll<HTMLButtonElement>('button')].some((b) => b.textContent?.trim() === 'Guardar cambios')).toBe(true);

    const saving = page.send();
    const patch = http.expectOne({ method: 'PATCH', url: `${API}/pro/quotes/q-edit` });
    expect(patch.request.body).toMatchObject({
      description: 'Reemplazo de sifón y flexibles',
      laborAmount: 20000,
      items: [{ description: 'Sifón', quantity: 2, unitPrice: 2500 }],
    });
    expect(patch.request.body).not.toHaveProperty('totalAmount');
    patch.flush(quote('q-edit', PRO_1, '25000.00', {
      description: 'Reemplazo de sifón y flexibles actualizado',
      laborAmount: '20000.00',
      materialsAmount: '5000.00',
    }));
    await saving;
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({
      status: 'QUOTES_RECEIVED',
      invitationStatus: 'QUOTED',
      ownQuote: quote('q-edit', PRO_1, '25000.00', { description: 'Reemplazo de sifón y flexibles actualizado' }),
    }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Presupuesto actualizado');
    expect(el.textContent).toContain('Editar presupuesto');
    expect(el.textContent).not.toContain('Enviar nuevo presupuesto');
  });

  it('accepted quote bloquea la ruta de edición', async () => {
    const accepted = quote('q-accepted', PRO_1, '25000.00', { status: 'ACCEPTED' });
    const { fixture, el } = await openQuote(proRequest({
      status: 'PROFESSIONAL_SELECTED',
      invitationStatus: 'SELECTED',
      selectedByClient: true,
      ownQuote: accepted,
    }), accepted.id);
    fixture.detectChanges();
    expect(el.textContent).toContain('El cliente ya aceptó este presupuesto. No se puede editar.');
    expect(texts(el)).not.toContain('Guardar cambios');
  });

  it('no envía nada si el total es 0 o falta descripción', async () => {
    const { http, page } = await openQuote();
    await page.send();
    http.expectNone(`${API}/pro/requests/${REQ_ID}/quote`);
  });
});

// ---------------------------------------------------------------------------
describe('cupo FREE de presupuestos', () => {
  async function openList(me: OwnProfessional, row = proRequest()) {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProRequestsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/me`).flush(me);
    http.expectOne((r) => r.url === `${API}/pro/requests` && r.params.get('status') === 'PENDING').flush({ items: [row], total: 1, page: 1, pageSize: 20 });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { http, fixture, el, strip: () => el.querySelector('[data-testid="quote-usage"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null };
  }

  it('el trabajo realizado tiene tratamiento propio y nunca ofrece coordinar de nuevo', async () => {
    const row = proRequest({
      status: 'COMPLETED', invitationStatus: 'SELECTED', selectedByClient: true,
      completedAt: '2026-09-29T15:00:00.000Z',
      job: { id: 'job-completed', status: 'COMPLETED', scheduledDate: '2026-09-29', scheduledTime: null, durationMinutes: 90 },
    });
    const { http, fixture, el } = await openList(ownMe(), row);
    Array.from<HTMLButtonElement>(el.querySelectorAll('[role="tab"]')).find((b) => b.textContent?.includes('Todas'))!.click();
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/pro/requests` && !r.params.has('status')).flush({ items: [row], total: 1, page: 1, pageSize: 20 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Trabajo realizado');
    expect(el.textContent).toContain('Ver trabajo realizado');
    expect(el.textContent).not.toContain('Ver datos para coordinar');
    expect(el.querySelector('a[href="/pro/trabajos/job-completed"]')).not.toBeNull();
  });

  it('PRO muestra respuestas ilimitadas sin presentar uso del cupo Free', async () => {
    const { el } = await openList(ownMe(usage(11, null), true));
    const copy = el.querySelector('[data-testid="pro-usage-copy"]')?.textContent ?? '';
    expect(copy).toContain('PRO activo');
    expect(copy).not.toContain('11 oportunidades');
    expect(copy).toContain('respuestas sin límite');
    expect(copy).toContain('acceso anticipado');
    expect(copy).not.toMatch(/conseguir|garantiza|trabajos/i);
  });

  it('Actualizar queda integrado al encabezado y muestra estado de carga', async () => {
    const { http, fixture, el } = await openList(ownMe());
    const refresh = button(el, 'Actualizar')!;
    expect(refresh.querySelector('app-icon')).not.toBeNull();
    refresh.click();
    fixture.detectChanges();
    expect(button(el, /Actualizando/ )?.getAttribute('aria-busy')).toBe('true');
    http.expectOne((r) => r.url === `${API}/pro/requests` && r.params.get('status') === 'PENDING').flush({ items: [proRequest()], page: 1, pageSize: 20, total: 1 });
    fixture.detectChanges();
    expect(button(el, 'Actualizar')?.getAttribute('aria-busy')).toBe('false');
  });

  it('0/5: contador con lo que queda, sin PRO', async () => {
    const { el, strip } = await openList(ownMe(usage(0)));
    expect(strip()).toContain('Oportunidades Free 0 de 5 usadas');
    expect(strip()).toContain('Te quedan 5 oportunidades Free.');
    expect(el.querySelector('[data-testid="quote-usage"] a')).toBeNull();
  });

  it('2/5: quedan 3 respuestas y un enlace discreto a PRO', async () => {
    const { el, strip } = await openList(ownMe(usage(2)));
    expect(strip()).toContain('2 de 5');
    expect(strip()).toContain('Te quedan 3 oportunidades Free.');
    expect(el.querySelector('[data-testid="quote-usage"] a[href="/pro/plan"]')!.textContent).toContain('Presupuestá sin límite con PRO');
  });

  it('4/5: queda 1 respuesta con "Ver PRO", sin bloquear ni modal', async () => {
    const { el, strip } = await openList(ownMe(usage(4), false, NO_OFFER));
    expect(strip()).toContain('Te queda 1 oportunidad Free.');
    expect(strip()).toContain('Con Resuelve PRO podés responder todas las oportunidades que te interesen.');
    expect(el.querySelector('[data-testid="quote-usage"] a[href="/pro/plan"]')!.textContent).toContain('Ver PRO');
    expect(el.querySelector('[data-testid="free-limit"]')).toBeNull();
    expect(el.querySelector('[data-testid="pro-offer"]')).toBeNull(); // no elegible: sin descuento
    expect(el.querySelector('dialog[open]')).toBeNull();
  });

  it('4/5 elegible: suma "20% OFF en tu primer mes de PRO" y lo mide (mostrada / click)', async () => {
    const { http, el, strip } = await openList(ownMe(usage(4), false, OFFER));
    expect(strip()).toContain('20% OFF en tu primer mes de PRO');
    expect(el.querySelector('dialog[open]')).toBeNull();
    const shown = http.expectOne({ method: 'POST', url: `${API}/pro/plan/offer-events` });
    expect(shown.request.body).toEqual({ type: 'SHOWN', surface: 'REQUESTS_USAGE', offerCode: 'PRO_FIRST_MONTH_20' });
    shown.flush({ recorded: true });
    (el.querySelector('[data-testid="quote-usage"] a[href="/pro/plan"]') as HTMLElement).click();
    const click = http.expectOne({ method: 'POST', url: `${API}/pro/plan/offer-events` });
    expect(click.request.body).toEqual({ type: 'CLICKED', surface: 'REQUESTS_USAGE', offerCode: 'PRO_FIRST_MONTH_20' });
    click.flush({ recorded: true });
  });

  it('2/5 aunque el backend la diera: la oferta todavía no aparece', async () => {
    const { el, strip } = await openList(ownMe(usage(2), false, OFFER));
    expect(strip()).not.toContain('OFF');
    expect(el.querySelector('[data-testid="pro-offer"]')).toBeNull();
  });

  it('5/5: sigue viendo solicitudes; límite con precio, "Conocer PRO" y "Seguir con Free"', async () => {
    const { http, fixture, el, strip } = await openList(ownMe(usage(5)));
    http.expectOne(`${API}/plans`).flush(PLANS);
    fixture.detectChanges();
    expect(strip()).toContain('5 de 5');
    expect(strip()).toContain('Usaste tus 5 oportunidades Free.');
    expect(strip()).toContain('Vas a seguir recibiendo solicitudes.');
    expect(strip()).toContain('Con Resuelve PRO podés responder nuevas oportunidades sin límite.');
    expect(el.querySelector('[data-testid="pro-price"]')!.textContent).toContain('$15.000');
    expect(el.querySelector('[data-testid="free-limit"] a[href="/pro/plan"]')!.textContent).toContain('Conocer PRO');
    expect(el.querySelector('[data-testid="pro-offer"]')).toBeNull();
    expect(el.textContent).toContain('Pérdida'); // la solicitud se sigue mostrando
    expect(el.querySelector('dialog[open]')).toBeNull(); // sin modal al entrar
    // "Seguir con Free": queda el contador, sin el bloque.
    button(el.querySelector('[data-testid="free-limit"]') as HTMLElement, 'Seguir con Free')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="free-limit"]')).toBeNull();
    expect(strip()).toContain('Usaste tus 5 oportunidades Free.');
  });

  it('5/5 elegible: "Tenés 20% OFF en tu primer mes." y el precio normal después', async () => {
    const { http, fixture, el } = await openList(ownMe(usage(5), false, OFFER));
    http.expectOne(`${API}/plans`).flush(PLANS);
    http.expectOne({ method: 'POST', url: `${API}/pro/plan/offer-events` }).flush({ recorded: true });
    fixture.detectChanges();
    const notice = el.querySelector('[data-testid="free-limit"]')!;
    expect(notice.querySelector('[data-testid="pro-offer"]')!.textContent!.replace(/\s+/g, ' ')).toContain('Tenés 20% OFF en tu primer mes.');
    expect(notice.querySelector('[data-testid="pro-price"]')!.textContent).toContain('$15.000');
    expect(notice.querySelector('[data-testid="pro-price"]')!.textContent).toContain('después del primer mes');
  });

  it('PRO: sin límite, sin avisos de cupo y sin oferta', async () => {
    const { el, strip } = await openList(ownMe(usage(25, null), true, OFFER));
    expect(strip()).toContain('PRO activo · respuestas sin límite.');
    expect(strip()).not.toContain('25 oportunidades');
    expect(strip()).toContain('Seguís teniendo respuestas sin límite y acceso anticipado a nuevas oportunidades.');
    expect(el.querySelector('[data-testid="pro-offer"]')).toBeNull();
  });

  it('trial se muestra solo como Prueba PRO privada y sin límite', async () => {
    const me = ownMe(usage(0, null)) as OwnProfessional;
    me.plan = {
      ...me.plan,
      trialActive: true,
      entitlementSource: 'FIRST_SUCCESS_TRIAL',
      entitlements: { ...me.plan.entitlements, canSendUnlimitedQuotes: true },
    };
    const { strip } = await openList(me);
    expect(strip()).toContain('Prueba PRO');
    expect(strip()).toContain('Respondé sin límite hasta conseguir tu primer cliente.');
  });

  it('oportunidad bloqueada muestra preview limitada y CTA PRO, sin cliente ni descripción', async () => {
    const row = proRequest({
      title: 'Plomería · Centro',
      description: '',
      client: null,
      opportunity: { blocked: true, targeted: false },
    });
    const { el } = await openList(ownMe(usage(5)), row);
    expect(el.textContent).toContain('Compatible con tu perfil');
    expect(el.textContent).toContain('Alcanzaste el límite total de Free');
    expect([...el.querySelectorAll('a[href="/pro/plan"]')].some((a) => a.textContent?.includes('Responder sin límite con PRO'))).toBe(true);
    expect(el.textContent).not.toContain('María G.');
  });

  async function openQuote(me: OwnProfessional) {
    const { http } = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProQuotePage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest());
    http.expectOne(`${API}/pro/me`).flush(me);
    fixture.detectChanges();
    http.expectOne(`${API}/plans`).flush(PLANS);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as { description: { set(v: string): void }; labor: { set(v: number): void }; send(): Promise<void> };
    page.description.set('Cambio de sifón y flexibles');
    page.labor.set(20000);
    return { http, fixture, page, el: fixture.nativeElement as HTMLElement };
  }

  const dialogText = (el: HTMLElement) => el.querySelector('dialog')!.textContent!.replace(/\s+/g, ' ');

  it('intento 6 con el cupo agotado: explica PRO ($15.000 / mes) sin mandar el pedido', async () => {
    const { http, fixture, page, el } = await openQuote(ownMe(usage(5)));
    expect(el.querySelector('[data-testid="free-limit"]')!.textContent).toContain('Usaste tus 5 oportunidades Free.');
    expect(el.querySelector('dialog[open]')).toBeNull(); // sin modal al entrar
    await page.send();
    fixture.detectChanges();
    http.expectNone(`${API}/pro/requests/${REQ_ID}/quote`);
    const dialog = el.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const text = dialogText(el);
    expect(text).toContain('No dejes pasar esta oportunidad');
    expect(text).toContain('Usaste tus 5 oportunidades Free.');
    expect(text).toContain('Vas a seguir recibiendo solicitudes');
    expect(text).toContain('Con PRO podés responder esta solicitud y todas las próximas sin límite.');
    expect(text).toContain('$15.000 / mes');
    expect(text).not.toContain('OFF'); // no elegible: sin descuento
    // Contexto real de la oportunidad (servicio y barrio), nunca contacto ni dirección.
    const ctx = dialog.querySelector('[data-testid="limit-context"]')!.textContent!;
    expect(ctx).toContain('Esta solicitud sigue disponible');
    expect(dialog.getAttribute('aria-labelledby')).toBe('quote-limit-title');
    expect(dialog.querySelector('a[href="/pro/plan?quiero=1"]')!.textContent).toContain('Quiero PRO');
    button(dialog as HTMLElement, 'Seguir con Free')!.click();
    fixture.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('dato viejo (4/5) pero el backend ya llegó al límite: FREE_QUOTE_LIMIT_REACHED abre el mismo diálogo', async () => {
    const { http, fixture, page, el } = await openQuote(ownMe(usage(4)));
    const sending = page.send();
    http
      .expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` })
      .flush(
        { statusCode: 403, code: 'FREE_QUOTE_LIMIT_REACHED', message: 'x', details: usage(5) },
        { status: 403, statusText: 'Forbidden' },
      );
    await sending;
    http.expectOne(`${API}/pro/me`).flush(ownMe(usage(5)));
    fixture.detectChanges();
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(true);
    expect(dialogText(el)).toContain('No dejes pasar esta oportunidad');
    expect(el.textContent).not.toContain('Presupuesto enviado');
  });

  it('intento 6 elegible: el 403 trae la oferta → "20% OFF en tu primer mes" y "Aprovechar oferta"', async () => {
    const { http, fixture, page, el } = await openQuote(ownMe(usage(4)));
    const sending = page.send();
    http
      .expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` })
      .flush(
        { statusCode: 403, code: 'FREE_QUOTE_LIMIT_REACHED', message: 'x', details: { ...usage(5), offer: OFFER } },
        { status: 403, statusText: 'Forbidden' },
      );
    await sending;
    http.expectOne(`${API}/pro/me`).flush(ownMe(usage(5), false, OFFER));
    fixture.detectChanges();
    const dialog = el.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const offer = dialog.querySelector('[data-testid="pro-offer"]')!.textContent!.replace(/\s+/g, ' ');
    expect(offer).toContain('Oferta'); // el descuento también con texto, no solo color
    expect(offer).toContain('20% OFF en tu primer mes');
    expect(offer).toContain('$12.000 el primer mes');
    expect(offer).toContain('Luego $15.000 / mes');
    expect(dialogText(el)).not.toMatch(/Solo hoy|termina en|\d{2}:\d{2}:\d{2}/);
    const shown = http.match({ method: 'POST', url: `${API}/pro/plan/offer-events` });
    expect(shown.map((r) => r.request.body.surface).sort()).toEqual(['LIMIT_MODAL', 'REQUESTS_USAGE']);
    shown.forEach((r) => r.flush({ recorded: true }));
    const cta = dialog.querySelector('a[href="/pro/plan?quiero=1"]') as HTMLElement;
    expect(cta.textContent).toContain('Aprovechar oferta');
    cta.click();
    const click = http.expectOne({ method: 'POST', url: `${API}/pro/plan/offer-events` });
    expect(click.request.body).toEqual({ type: 'CLICKED', surface: 'LIMIT_MODAL', offerCode: 'PRO_FIRST_MONTH_20' });
    click.flush({ recorded: true });
  });

  it('intento 6 si ya usó la oferta: el 403 dice no elegible y gana sobre un /pro/me viejo', async () => {
    const { http, fixture, page, el } = await openQuote(ownMe(usage(4)));
    const sending = page.send();
    http
      .expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` })
      .flush(
        { statusCode: 403, code: 'FREE_QUOTE_LIMIT_REACHED', message: 'x', details: { ...usage(5), offer: { eligible: false, reason: 'ALREADY_REDEEMED' } } },
        { status: 403, statusText: 'Forbidden' },
      );
    await sending;
    http.expectOne(`${API}/pro/me`).flush(ownMe(usage(5)));
    fixture.detectChanges();
    expect(dialogText(el)).not.toContain('OFF');
    expect(el.querySelector('dialog a[href="/pro/plan?quiero=1"]')!.textContent).toContain('Quiero PRO');
  });

  it('la quinta respuesta se envía y avisa del límite sin tapar el éxito', async () => {
    const { http, fixture, page, el } = await openQuote(ownMe(usage(4)));
    const sending = page.send();
    http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/quote` }).flush(quote('q-5', PRO_1, '20000.00'));
    await sending;
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(proRequest({ invitationStatus: 'QUOTED' }));
    http.expectOne(`${API}/pro/me`).flush(ownMe(usage(5)));
    fixture.detectChanges();
    expect(el.textContent).toContain('Presupuesto enviado');
    const notice = el.querySelector('[data-testid="free-limit"]')!;
    expect(notice.textContent).toContain('Usaste tus 5 oportunidades Free.');
    expect(notice.querySelector('a')!.textContent).toContain('Conocer PRO');
    expect(el.querySelector('dialog[open]')).toBeNull();
    button(notice as HTMLElement, 'Seguir con Free')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="free-limit"]')).toBeNull();
    expect(el.textContent).toContain('Presupuesto enviado');
  });
});
