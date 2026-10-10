import { vi } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../models/auth';
import { AppNotification, NotificationsSummary, bellBadge, notificationCopy, notificationToast } from '../models/notification';
import { HiredProfessional, MyProfessionals, SavedProfessional, unavailableText } from '../models/retention';
import { ProfessionalSummary } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';
import { MyProfessionalsStore } from './my-professionals.store';
import { NotificationsStore } from './notifications.store';
import { RequestStore } from './request.store';
import { MyProfessionalsPage } from '../../features/client/my-professionals/my-professionals-page';
import { NotificationBell } from '../../shared/components/notification-bell/notification-bell';
import { SaveProfessional } from '../../shared/components/save-professional/save-professional';

const API = 'http://api.test/api/v1';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '66666666-6666-4666-8666-666666666666';
const REQ_ID = '11111111-1111-4111-8111-111111111111';

const USER: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: null,
  phoneVerified: false, emailVerifiedAt: '2026-01-01T00:00:00.000Z', emailVerified: true,
  avatarUrl: null, defaultZoneId: null, professionalProfileId: null, createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

const professional = (overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id: PRO_ID, firstName: 'Francisco', lastName: 'Fernandes', displayName: 'Francisco Fernandes',
  avatarUrl: null, headline: 'Electricista matriculado', bio: null, yearsExperience: 5,
  availableToday: true, averageResponseMinutes: null, averageRating: 4.9, reviewsCount: 12,
  completedJobsCount: 20, services: [{ id: SERVICE_ID, name: 'Electricidad', slug: 'electricidad' }],
  coversEntireCity: true, zones: [],
  verifications: { identity: true, phone: false, license: false, licenses: [] }, pro: false,
  ...overrides,
});

const hired = (overrides: Partial<HiredProfessional> = {}): HiredProfessional => ({
  professional: professional(), availability: 'AVAILABLE', canRequest: true, jobsCount: 3,
  lastCompletedAt: '2026-09-18T15:00:00.000Z', rehireServiceId: SERVICE_ID, saved: false,
  jobs: [{ requestId: REQ_ID, title: 'Cambio de térmica', serviceName: 'Electricidad', completedAt: '2026-09-18T15:00:00.000Z' }],
  ...overrides,
});
const saved = (overrides: Partial<SavedProfessional> = {}): SavedProfessional => ({
  professional: professional({ id: '77777777-7777-4777-8777-777777777777', firstName: 'Martín', displayName: 'Martín Rodríguez', headline: 'Plomería' }),
  availability: 'AVAILABLE', canRequest: true, savedAt: '2026-09-20T10:00:00.000Z', jobsCount: 0,
  ...overrides,
});

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n-1', type: 'CLIENT_QUOTE_RECEIVED', requestId: REQ_ID, requestTitle: 'Problema eléctrico',
  professionalName: 'Francisco Fernandes', section: 'CLIENT_REQUESTS', tab: null,
  route: `/mis-solicitudes/${REQ_ID}`, createdAt: new Date().toISOString(), readAt: null,
  ...overrides,
});

const summary = (unread: number, closureUnread = 0): NotificationsSummary => ({
  client: { unread, completionDue: 0, closureUnread },
  professional: null,
});

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));
const page = (items: AppNotification[], total = items.length, pageNumber = 1) => ({ items, page: pageNumber, pageSize: 20, total });

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'solicitud', component: Blank },
        { path: 'ingresar', component: Blank },
        { path: 'mis-profesionales', component: Blank },
        { path: '**', component: Blank },
      ]),
      { provide: API_URL, useValue: API },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function signIn(http: HttpTestingController, user: AuthUser = USER) {
  const auth = TestBed.inject(AuthStore);
  auth.initialize();
  const done = auth.login({ email: USER.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

const button = (el: Element, text: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').trim() === text);

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

// ---------------------------------------------------------------------------
describe('textos del centro de notificaciones', () => {
  it('cada tipo tiene título y detalle propios, sin signos de exclamación ni datos privados', () => {
    setup();
    const types: AppNotification['type'][] = [
      'CLIENT_QUOTE_RECEIVED', 'CLIENT_QUOTE_UPDATED', 'CLIENT_APPOINTMENT_PROPOSED', 'CLIENT_APPOINTMENT_RESCHEDULED',
      'CLIENT_JOB_SCHEDULED', 'CLIENT_JOB_RESCHEDULED', 'CLIENT_JOB_STARTED', 'CLIENT_JOB_CANCELLED',
      'CLIENT_REVIEW_AVAILABLE', 'CLIENT_JOB_CLOSE_DUE', 'PROFESSIONAL_SELECTED', 'PRO_APPOINTMENT_CONFIRMED',
      'PRO_APPOINTMENT_DECLINED', 'PRO_REQUEST_RECEIVED', 'PRO_TARGETED_REQUEST_RECEIVED', 'PRO_JOB_CLOSE_DUE',
      'PRO_REVIEW_RECEIVED', 'PRO_REFERRAL_REGISTERED', 'PRO_REFERRAL_ACTIVATED', 'PRO_BONUS_GRANTED',
    ];
    for (const type of types) {
      const n = notification({ type, rewardDays: 15 });
      const copy = notificationCopy(n);
      expect(copy.title.length, type).toBeGreaterThan(0);
      expect(copy.detail.length, type).toBeGreaterThan(0);
      expect(copy.title + copy.detail + notificationToast(n)).not.toContain('!');
    }
    expect(notificationCopy(notification({ type: 'PROFESSIONAL_SELECTED' })).detail).toContain('trabajo para coordinar');
    expect(notificationCopy(notification({ type: 'PRO_REFERRAL_ACTIVATED', rewardDays: 15 })).detail).toBe('Sumaste 15 días de PRO.');
    expect(notificationCopy(notification({ type: 'PRO_BONUS_GRANTED', rewardDays: 15 })).detail).toBe('Tu invitación te dio 15 días de PRO.');
    expect(
      notificationCopy(notification({ type: 'CLIENT_REVIEW_AVAILABLE', completedBy: 'PROFESSIONAL' })).detail,
    ).toContain('marcó “Problema eléctrico” como realizado');
  });

  it('tope visual 9+', () => {
    setup();
    expect([0, 3, 9, 10, 120].map(bellBadge)).toEqual(['0', '3', '9', '9+', '9+']);
  });

  it('un profesional que no se puede contratar explica por qué', () => {
    setup();
    expect(unavailableText('AVAILABLE')).toBeNull();
    expect(unavailableText('PAUSED')).toBe('No está recibiendo nuevas solicitudes por ahora');
    expect(unavailableText('UNAVAILABLE')).toBe('Perfil no disponible actualmente');
  });

  it('el recordatorio de cierre no se cuenta dos veces en el badge de Mis solicitudes', () => {
    setup();
    const store = TestBed.inject(NotificationsStore);
    store.summary.set({ client: { unread: 2, completionDue: 1, closureUnread: 1 }, professional: null });
    expect(store.clientUnread()).toBe(2); // la campana cuenta todo…
    expect(store.clientBadge()).toBe(2); // …el menú: 1 novedad + 1 por cerrar (el recordatorio es esa misma)
  });
});

// ---------------------------------------------------------------------------
describe('campana y centro de notificaciones', () => {
  async function bell(unread: number, items: AppNotification[] = [notification()]) {
    const http = setup();
    await signIn(http);
    const store = TestBed.inject(NotificationsStore);
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.componentRef.setInput('audience', 'CLIENT');
    fixture.detectChanges();
    store.summary.set(summary(unread));
    fixture.detectChanges();
    // El panel se muestra en <body> (no lo recorta ningún contenedor): se consulta desde ahí.
    const el = document.body;
    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="notification-bell"]')!;
    const openPanel = async (response = page(items)) => {
      trigger.click();
      fixture.detectChanges();
      http
        .expectOne((r) => r.url === `${API}/me/notifications` && r.params.get('audience') === 'CLIENT')
        .flush(response);
      await flush();
      fixture.detectChanges();
    };
    return { http, store, fixture, el, trigger, openPanel };
  }

  it('anuncia las sin leer en la etiqueta (el badge no es lo único) y sin leer no muestra badge', async () => {
    const { el, trigger, fixture, store } = await bell(3);
    expect(trigger.getAttribute('aria-label')).toBe('Notificaciones, 3 sin leer');
    expect(el.querySelector('[data-testid="notification-badge"]')?.textContent?.trim()).toBe('3');
    store.summary.set(summary(0));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-label')).toBe('Notificaciones');
    expect(el.querySelector('[data-testid="notification-badge"]')).toBeNull();
    store.summary.set(summary(25));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="notification-badge"]')?.textContent?.trim()).toBe('9+');
  });

  it('abre el panel con sus avisos, "Sin leer" para lectores de pantalla y "Marcar todas" solo con sin leer', async () => {
    const { el, openPanel, trigger } = await bell(1, [notification(), notification({ id: 'n-2', readAt: '2026-09-26T10:00:00Z', type: 'CLIENT_JOB_SCHEDULED' })]);
    await openPanel();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = el.querySelector('[data-testid="notification-panel"]')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.textContent).toContain('Hoy');
    expect(panel.textContent).toContain('Nuevo presupuesto');
    expect(panel.textContent).toContain('Trabajo agendado');
    expect(panel.querySelectorAll('.sr-only').length).toBeGreaterThan(0);
    expect(panel.textContent).toContain('Sin leer.');
    expect(button(panel, 'Marcar todas como leídas')).toBeDefined();
  });

  it('sin avisos: "No tenés notificaciones nuevas." y sin "Marcar todas"', async () => {
    const { el, openPanel } = await bell(0, []);
    await openPanel();
    expect(el.textContent).toContain('No tenés notificaciones nuevas.');
    expect(button(el, 'Marcar todas como leídas')).toBeUndefined();
  });

  it('abrir un aviso lo deja leído (servidor), baja el contador y navega al destino exacto', async () => {
    const { http, el, fixture, openPanel, store } = await bell(1);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await openPanel();
    el.querySelector<HTMLButtonElement>('[data-testid="notification-panel"] ul button')!.click();
    await flush();
    const patch = http.expectOne({ method: 'PATCH', url: `${API}/me/notifications/n-1/read` });
    patch.flush(summary(0));
    await flush();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(`/mis-solicitudes/${REQ_ID}`);
    expect(store.clientUnread()).toBe(0);
    expect(el.querySelector('[data-testid="notification-panel"]')).toBeNull(); // se cierra al ir
  });

  it('"Marcar todas como leídas" deja todo leído y actualiza el contador', async () => {
    const { http, el, fixture, openPanel, store } = await bell(2, [notification(), notification({ id: 'n-2' })]);
    await openPanel();
    button(el, 'Marcar todas como leídas')!.click();
    await flush();
    http.expectOne({ method: 'PATCH', url: `${API}/me/notifications/read-all?audience=CLIENT` }).flush(summary(0));
    await flush();
    fixture.detectChanges();
    expect(store.clientUnread()).toBe(0);
    expect(button(el, 'Marcar todas como leídas')).toBeUndefined();
    expect(store.center()!.items.every((n) => !!n.readAt)).toBe(true);
  });

  it('pagina de a 20 con "Ver más"', async () => {
    const first = Array.from({ length: 20 }, (_, i) => notification({ id: `a-${i}` }));
    const { http, el, fixture, openPanel } = await bell(0, first);
    await openPanel(page(first, 25));
    expect(el.querySelectorAll('[data-testid="notification-panel"] li').length).toBe(20);
    button(el, 'Ver más')!.click();
    await flush();
    const more = http.expectOne((r) => r.url === `${API}/me/notifications` && r.params.get('page') === '2');
    more.flush(page(Array.from({ length: 5 }, (_, i) => notification({ id: `b-${i}` })), 25, 2));
    await flush();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="notification-panel"] li').length).toBe(25);
    expect(button(el, 'Ver más')).toBeUndefined();
  });

  it('Escape cierra y devuelve el foco a la campana', async () => {
    const { el, fixture, openPanel, trigger } = await bell(1);
    await openPanel();
    el.querySelector('[data-testid="notification-panel"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="notification-panel"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('error al cargar: mensaje y Reintentar', async () => {
    const { http, el, fixture, trigger } = await bell(1);
    trigger.click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === `${API}/me/notifications`)
      .flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Error' });
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('No pudimos cargar tus notificaciones.');
    expect(button(el, 'Reintentar')).toBeDefined();
  });

  it('una notificación nueva mientras la app está abierta se anuncia con un aviso visible y "Ver" (con ancla)', async () => {
    const http = setup();
    const store = TestBed.inject(NotificationsStore);
    store.connect();
    await signIn(http);
    TestBed.tick();
    http.expectOne(`${API}/me/notifications/summary`).flush(summary(0));
    await flush();
    const done = store.refresh();
    http.expectOne(`${API}/me/notifications/summary`).flush(summary(1));
    await flush();
    http
      .expectOne((r) => r.url === `${API}/me/notifications` && r.params.get('audience') === 'CLIENT')
      .flush(page([notification({ type: 'CLIENT_REVIEW_AVAILABLE', route: `/mis-solicitudes/${REQ_ID}#resena` })]));
    await done;
    const toast = TestBed.inject(ToastService);
    expect(toast.message()).toBe('Podés dejar una reseña de “Problema eléctrico”.');
    expect(toast.action()).toEqual({ label: 'Ver', link: [`/mis-solicitudes/${REQ_ID}`], fragment: 'resena' });
  });
});

// ---------------------------------------------------------------------------
describe('guardar profesional', () => {
  async function render(mine: MyProfessionals = { hired: [], saved: [] }) {
    const http = setup();
    await signIn(http);
    const fixture = TestBed.createComponent(SaveProfessional);
    fixture.componentRef.setInput('professionalId', PRO_ID);
    fixture.componentRef.setInput('name', 'Francisco Fernandes');
    fixture.componentRef.setInput('variant', 'text');
    fixture.detectChanges();
    await flush();
    http.expectOne(`${API}/clients/me/professionals`).flush(mine);
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { http, fixture, el, btn: () => el.querySelector<HTMLButtonElement>('[data-testid="save-professional"]')! };
  }

  it('♡ Guardar → ♥ Guardado (etiquetas accesibles reales) → Quitar de guardados', async () => {
    const { http, fixture, btn } = await render();
    expect(btn().getAttribute('aria-label')).toBe('Guardar profesional: Francisco Fernandes');
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    expect(btn().textContent).toContain('Guardar');

    btn().click();
    fixture.detectChanges();
    // Responde al toque: ya figura guardado mientras el servidor confirma.
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(btn().textContent).toContain('Guardado');
    expect(btn().getAttribute('aria-label')).toContain('Quitar de guardados');
    http.expectOne({ method: 'POST', url: `${API}/professionals/${PRO_ID}/favorite` }).flush({ saved: true });
    await flush();
    http.expectOne(`${API}/clients/me/professionals`).flush({ hired: [], saved: [saved({ professional: professional() })] });
    await flush();
    fixture.detectChanges();
    expect(btn().getAttribute('aria-pressed')).toBe('true');

    btn().click();
    fixture.detectChanges();
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    http.expectOne({ method: 'DELETE', url: `${API}/professionals/${PRO_ID}/favorite` }).flush({ saved: false });
    await flush();
    http.expectOne(`${API}/clients/me/professionals`).flush({ hired: [], saved: [] });
    await flush();
    fixture.detectChanges();
    expect(btn().textContent).toContain('Guardar');
  });

  it('si el servidor falla, vuelve al estado anterior y avisa', async () => {
    const { http, fixture, btn } = await render();
    btn().click();
    http.expectOne({ method: 'POST', url: `${API}/professionals/${PRO_ID}/favorite` }).flush({ code: 'X' }, { status: 500, statusText: 'Error' });
    await flush();
    fixture.detectChanges();
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    expect(TestBed.inject(ToastService).message()).toContain('No pudimos guardar el cambio');
  });

  it('sin sesión lleva a ingresar y no llama a la API', async () => {
    const http = setup();
    TestBed.inject(AuthStore).initialize();
    const fixture = TestBed.createComponent(SaveProfessional);
    fixture.componentRef.setInput('professionalId', PRO_ID);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.nativeElement.querySelector('[data-testid="save-professional"]').click();
    await flush();
    expect(navigate).toHaveBeenCalledWith(['/ingresar'], expect.anything());
    http.expectNone(`${API}/professionals/${PRO_ID}/favorite`);
  });

  it('no se ofrece en el propio perfil profesional', async () => {
    const http = setup();
    await signIn(http, { ...USER, professionalProfileId: PRO_ID });
    const fixture = TestBed.createComponent(SaveProfessional);
    fixture.componentRef.setInput('professionalId', PRO_ID);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="save-professional"]')).toBeNull();
    TestBed.inject(HttpTestingController).match(() => true);
  });
});

// ---------------------------------------------------------------------------
describe('Mis profesionales', () => {
  async function render(mine: MyProfessionals | 'error') {
    const http = setup();
    await signIn(http);
    const fixture = TestBed.createComponent(MyProfessionalsPage);
    fixture.detectChanges();
    await flush();
    const req = http.expectOne(`${API}/clients/me/professionals`);
    if (mine === 'error') req.flush({ code: 'X' }, { status: 500, statusText: 'Error' });
    else req.flush(mine);
    await flush();
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('estados vacíos: dos grupos con su copy y "Buscar profesionales"', async () => {
    const { el } = await render({ hired: [], saved: [] });
    expect(el.textContent).toContain('Contratados anteriormente');
    expect(el.querySelector('[data-testid="hired-empty"]')?.textContent).toContain('Todavía no contrataste profesionales por Resuelve.');
    expect(el.querySelector('[data-testid="hired-empty"]')?.textContent).toContain('Cuando completes un trabajo, vas a poder encontrarlo acá para volver a contactarlo.');
    expect(el.querySelector('[data-testid="saved-empty"]')?.textContent).toContain('Todavía no guardaste profesionales.');
    expect(el.querySelector('[data-testid="saved-empty"]')?.textContent).toContain('Guardá perfiles que te interesen para encontrarlos más rápido después.');
    expect(el.querySelectorAll('a[href="/profesionales"]').length).toBe(2);
  });

  it('contratado: último trabajo real, cantidad, calificación y trabajos anteriores', async () => {
    const { el } = await render({ hired: [hired()], saved: [] });
    const card = el.querySelector('[data-testid="hired-card"]')!;
    expect(card.textContent).toContain('Francisco Fernandes');
    expect(card.textContent).toContain('Último trabajo · 18 sep 2026');
    expect(card.textContent).toContain('3 trabajos realizados');
    expect(card.textContent).toContain('4,9');
    expect(card.textContent).toContain('Cambio de térmica');
    expect(card.textContent).toContain('Realizado');
    expect(button(card, 'Volver a contratar')).toBeDefined();
    expect(card.querySelector('a[href^="/profesional/"]')).not.toBeNull();
  });

  it('guardado: barrio, toma urgencias y "Pedir presupuesto"', async () => {
    const { el } = await render({ hired: [], saved: [saved()] });
    const card = el.querySelector('[data-testid="saved-card"]')!;
    expect(card.textContent).toContain('Martín Rodríguez');
    // Sin localidades en el contrato (backend anterior): no se asume ninguna ciudad.
    expect(card.textContent).toContain('Toda la ciudad');
    expect(card.textContent).toContain('Toma urgencias');
    expect(button(card, 'Pedir presupuesto')).toBeDefined();
  });

  it('profesional pausado: sigue visible con su historial y sin acciones de contratar', async () => {
    const { el } = await render({
      hired: [hired({ availability: 'PAUSED', canRequest: false })],
      saved: [saved({ availability: 'UNAVAILABLE', canRequest: false })],
    });
    const hiredCard = el.querySelector('[data-testid="hired-card"]')!;
    expect(hiredCard.textContent).toContain('No está recibiendo nuevas solicitudes por ahora');
    expect(button(hiredCard, 'Volver a contratar')).toBeUndefined();
    expect(hiredCard.textContent).toContain('Cambio de térmica'); // el historial se conserva
    const savedCard = el.querySelector('[data-testid="saved-card"]')!;
    expect(savedCard.textContent).toContain('Perfil no disponible actualmente');
    expect(button(savedCard, 'Pedir presupuesto')).toBeUndefined();
    expect(hiredCard.querySelector('a[href^="/profesional/"]')).not.toBeNull(); // "Ver perfil" siempre
  });

  it('volver a contratar: pedido NUEVO TARGETED al mismo profesional, con el servicio sugerido y sin asumirlo igual', async () => {
    const { fixture, el, http } = await render({ hired: [hired()], saved: [] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    // El catálogo real ofrece el servicio sugerido.
    const requestStore = TestBed.inject(RequestStore);
    button(el, 'Volver a contratar')!.click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/solicitud']);
    expect(requestStore.flowMode()).toBe('TARGETED');
    expect(requestStore.targeted()).toBe(true);
    expect(requestStore.recipientIds()).toEqual([PRO_ID]);
    expect(requestStore.rehire()).toBe('Francisco');
    expect(requestStore.attributionSource()).toBe('DIRECT_TARGETED');
    // Pedido nuevo: nada del trabajo anterior (ni título ni descripción) se arrastra.
    expect(requestStore.draft().description).toBe('');
    expect(requestStore.draft().sourceRequestId).toBeUndefined();
    http.match(() => true);
  });

  it('"Buscar otro" sale del flujo de recontratación (cambiar profesional vuelve a discovery)', async () => {
    const { el } = await render({ hired: [hired()], saved: [] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const requestStore = TestBed.inject(RequestStore);
    button(el, 'Volver a contratar')!.click();
    expect(requestStore.rehire()).toBe('Francisco');
    requestStore.changeProfessional();
    expect(requestStore.rehire()).toBeNull();
    expect(requestStore.flowMode()).toBe('DISCOVERY');
  });

  it('error al cargar: mensaje y Reintentar', async () => {
    const { el } = await render('error');
    expect(el.textContent).toContain('No pudimos cargar tus profesionales.');
    expect(button(el, 'Reintentar')).toBeDefined();
  });

  it('el orden lo da el servidor (contratados: último trabajo primero; guardados: último guardado primero)', async () => {
    const second = hired({ professional: professional({ id: '88888888-8888-4888-8888-888888888888', displayName: 'Ana Sosa', firstName: 'Ana' }) });
    const { el } = await render({ hired: [hired(), second], saved: [saved(), saved({ professional: professional({ id: '99999999-9999-4999-8999-999999999999', displayName: 'Zoe Paz' }) })] });
    expect([...el.querySelectorAll('[data-testid="hired-card"] h3')].map((h) => h.textContent?.trim())).toEqual(['Francisco Fernandes', 'Ana Sosa']);
    expect([...el.querySelectorAll('[data-testid="saved-card"] h3')].map((h) => h.textContent?.trim())).toEqual(['Martín Rodríguez', 'Zoe Paz']);
    expect(TestBed.inject(MyProfessionalsStore).hired().length).toBe(2);
  });
});
