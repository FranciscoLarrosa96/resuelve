import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { Category, Service, Zone } from '../models/category';
import { ProfessionalSummary } from '../models/professional';
import { REQUEST_STEPS } from '../models/service-request';
import { formatDesiredDate } from '../utils/dates';
import { CatalogStore } from './catalog.store';
import { RequestStore, serviceAndTitle } from './request.store';
import { SearchStore } from './search.store';
import { ProfessionalsStore } from './professionals.store';
import { RequestFlowPage } from '../../features/client/request-flow/request-flow-page';
import { QuoteRequestPage } from '../../features/client/quote-request/quote-request-page';
import { UrgentPage } from '../../features/client/urgent/urgent-page';
import { businessDay } from '../utils/business-time';
import { useTestLocality } from './locality.testing';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const DRAFT_KEY = 'resuelve.requestDraft';
const ARIEL = '22222222-2222-4222-8222-222222222222';
const BRUNO = '33333333-3333-4333-8333-333333333333';
const CENTRO: Zone = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Centro',
  slug: 'centro',
  cityId: 'c',
};
const VILLA: Zone = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Villa Italia',
  slug: 'villa-italia',
  cityId: 'c',
};
const PC: Service = {
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Reparación de PC',
  slug: 'reparacion-de-pc',
  categoryId: 'tec',
  requiresLicense: false,
};
const GAS: Service = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Gas',
  slug: 'gas',
  categoryId: 'hogar',
  requiresLicense: true,
};
const PLOMERIA: Service = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Plomería',
  slug: 'plomeria',
  categoryId: 'hogar',
  requiresLicense: false,
};
const CATEGORIES: Category[] = [
  { id: 'hogar', name: 'Hogar', slug: 'hogar' } as Category,
  { id: 'tec', name: 'Tecnología', slug: 'tecnologia' } as Category,
];
const SERVICES = [PC, GAS, PLOMERIA];

/** Ariel: Reparación de PC, solo Centro, atiende urgencias. */
const ariel = (overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id: ARIEL,
  firstName: 'Ariel',
  lastName: 'Suasnabar',
  displayName: 'Ariel Jesús Suasnabar',
  avatarUrl: null,
  headline: null,
  bio: null,
  yearsExperience: 4,
  availableToday: true,
  averageResponseMinutes: null,
  averageRating: null,
  reviewsCount: 0,
  completedJobsCount: 0,
  services: [{ id: PC.id, name: PC.name, slug: PC.slug }],
  coversEntireCity: false,
  zones: [{ id: CENTRO.id, name: CENTRO.name, slug: CENTRO.slug }],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  pro: false,
  ...overrides,
});

@Component({ template: '' })
class Blank {}

function setup() {
  useTestLocality();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(CatalogStore).loadCatalog();
  http.expectOne(`${API}/categories`).flush(CATEGORIES);
  http.expectOne(`${API}/services`).flush(SERVICES);
  return http;
}

const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const buttons = (el: Element) => Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
const byText = (el: Element, text: string) =>
  buttons(el).find((b) => (b.textContent ?? '').trim() === text);
const byLabel = (el: Element, label: string) =>
  el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const visibleText = (el: HTMLElement) => el.textContent!.replace(/\s+/g, ' ');

/** Responde lo que piden las pantallas (zonas y búsquedas) con datos mínimos reales. */
function answer(http: HttpTestingController) {
  for (const req of http.match(() => true) as TestRequest[]) {
    if (req.cancelled) continue;
    if (req.request.url.endsWith('/zones')) req.flush([CENTRO, VILLA]);
    else if (req.request.url.endsWith('/professionals'))
      req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
  }
}

/** Entró por el perfil de Ariel → "Solicitar presupuesto" (explorando). */
function targetAriel(overrides: Partial<ProfessionalSummary> = {}) {
  const search = TestBed.inject(SearchStore);
  search.explore(null);
  search.prepareRequest([ariel(overrides)], 'TARGETED');
  return TestBed.inject(RequestStore);
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('flujo dirigido: el profesional elegido sobrevive a la edición', () => {
  it('base: Ariel → Solicitar presupuesto → modo dirigido; el payload invita SOLO a Ariel', () => {
    setup();
    const store = targetAriel();
    expect(store.flowMode()).toBe('TARGETED');
    expect(store.targeted()).toBe(true);
    expect(store.draft().service.id).toBe(PC.id);
    expect(store.recipientIds()).toEqual([ARIEL]);
  });

  it('discovery con un solo profesional elegido sigue sin ser targeted', () => {
    setup();
    const search = TestBed.inject(SearchStore);
    search.explore(null);
    search.prepareRequest([ariel()], 'DISCOVERY');
    const store = TestBed.inject(RequestStore);

    expect(store.recipients()).toHaveLength(1);
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(store.targeted()).toBe(false);
  });

  it('agregar un segundo profesional a una solicitud individual la pasa a discovery', () => {
    setup();
    const store = targetAriel();
    expect(store.targeted()).toBe(true);

    store.addRecipient(ariel({ id: BRUNO, firstName: 'Bruno' }));
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(store.targeted()).toBe(false);
  });

  it('editar fecha, descripción o título NO rompe el target', () => {
    setup();
    const store = targetAriel();
    store.setZone(CENTRO);
    store.updateDraft({ desiredDate: '2026-10-04' });
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.updateTitle('No prende la PC');
    expect(store.draft().desiredDate).toBe('2026-10-04');
    expect(store.targeted()).toBe(true);
    expect(store.targetProblems()).toEqual([]);
    expect(store.issues()).toEqual([]);
  });

  it('urgencia: sigue si Ariel atiende urgencias; si no, se explica (no se rompe en silencio)', () => {
    setup();
    const ok = targetAriel();
    ok.setZone(CENTRO);
    ok.updateDraft({ urgency: 'URGENT' });
    expect(ok.targetProblems()).toEqual([]);

    TestBed.resetTestingModule();
    sessionStorage.clear();
    setup();
    const busy = targetAriel({ availableToday: false });
    busy.updateDraft({ urgency: 'URGENT' });
    expect(busy.targetProblems().map((p) => p.issue)).toEqual(['availability']);
    expect(busy.issues()).toContain('target');
  });

  it('servicio o barrio incompatibles invalidan a Ariel (y bloquean el envío); uno compatible, no', () => {
    setup();
    const store = targetAriel();
    store.setZone(CENTRO);
    expect(store.targetProblems()).toEqual([]);
    store.setZone(VILLA);
    expect(store.targetProblems().map((p) => p.issue)).toEqual(['zone']);
    expect(store.issues()).toContain('target');
    store.setZone(CENTRO);
    store.setService(GAS);
    expect(store.targetProblems().map((p) => p.issue)).toEqual(['service']);
  });

  it('"Cambiar profesional" es la única salida: DISCOVERY con el mismo pedido', () => {
    setup();
    const store = targetAriel();
    store.updateDraft({ desiredDate: '2026-10-04' });
    store.changeProfessional();
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(store.recipients()).toEqual([]);
    expect(store.draft()).toMatchObject({ desiredDate: '2026-10-04', service: { id: PC.id } });
    expect(store.hasContext()).toBe(true);
  });

  it('volver al perfil de Ariel y tocar "Solicitar presupuesto" otra vez conserva lo editado', () => {
    setup();
    const store = targetAriel();
    store.updateDraft({ desiredDate: '2026-10-04' });
    store.updateDescription('La PC no prende desde ayer a la noche.');
    TestBed.inject(SearchStore).prepareRequest([ariel()], 'TARGETED');
    expect(store.draft()).toMatchObject({
      desiredDate: '2026-10-04',
      description: 'La PC no prende desde ayer a la noche.',
    });
    // Otro profesional explorando: pedido nuevo (no se mezclan pedidos).
    TestBed.inject(SearchStore).prepareRequest(
      [ariel({ id: BRUNO, firstName: 'Bruno' })],
      'TARGETED',
    );
    expect(store.draft().desiredDate).toBeNull();
  });

  it('F5: el target, la fecha y la vuelta a "Solicitar presupuesto" persisten', () => {
    setup();
    const store = targetAriel();
    store.updateDraft({ desiredDate: '2026-10-04' });
    store.editFromQuote();
    TestBed.tick();
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY)!);
    expect(saved).toMatchObject({ v: 2, flowMode: 'TARGETED', returnToQuote: true });
    expect(saved.draft).not.toHaveProperty('when');

    TestBed.resetTestingModule();
    setup();
    const restored = TestBed.inject(RequestStore);
    expect(restored.targeted()).toBe(true);
    expect(restored.returnToQuote()).toBe(true);
    expect(restored.draft().desiredDate).toBe('2026-10-04');
    expect(restored.recipients()[0]).toMatchObject({
      id: ARIEL,
      serviceIds: [PC.id],
      zoneIds: [CENTRO.id],
    });
  });

  it('un borrador v1 (con la etiqueta "Hoy" guardada) se sigue leyendo sin pisar la fecha', () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        draft: {
          id: 'draft-x',
          description: 'No prende',
          title: 'No prende',
          urgency: 'FLEXIBLE',
          service: { id: PC.id, slug: PC.slug, name: PC.name },
          zone: null,
          when: 'Hoy',
          desiredDate: '2026-10-04',
        },
        recipients: [
          {
            id: ARIEL,
            displayName: 'Ariel Jesús Suasnabar',
            firstName: 'Ariel',
            avatarUrl: null,
            averageRating: null,
            reviewsCount: 0,
            availableToday: true,
          },
        ],
        pendingRequestId: null,
      }),
    );
    setup();
    const store = TestBed.inject(RequestStore);
    expect(store.draft().desiredDate).toBe('2026-10-04');
    expect(store.draft()).not.toHaveProperty('when');
    expect(store.targeted()).toBe(false);
    expect(store.flowMode()).toBe('DISCOVERY');
    // v1 no guardaba la intención; no se la infiere de que haya un destinatario.
    store.setZone(VILLA);
    expect(store.targetProblems()).toEqual([]);
  });
});

describe('fecha canónica (día de Argentina, sin depender del huso del navegador)', () => {
  it('a las 22:30 del sábado en Tandil (01:30 UTC del domingo) "hoy" sigue siendo sábado', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T01:30:00Z'));
    setup();
    const store = TestBed.inject(RequestStore);
    expect(store.dateFor(0)).toBe('2026-10-03');
    store.updateDraft({ urgency: 'TODAY' });
    expect(store.draft().desiredDate).toBe('2026-10-03');
    expect(store.whenLabel()).toBe('Hoy');
    expect(formatDesiredDate('2026-10-04')).toBe('Mañana');
    expect(formatDesiredDate('2026-10-06', '2026-10-03')).toBe('Mar 6/10');
  });

  it('sin fecha elegida no se muestra "Hoy" de relleno', () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    expect(store.draft().desiredDate).toBeNull();
    expect(store.whenLabel()).toBe('A coordinar');
  });
});

describe('"Revisá tu pedido" (paso 5) según el modo', () => {
  async function openFlow() {
    const fixture = TestBed.createComponent(RequestFlowPage);
    fixture.detectChanges();
    await fixture.whenStable();
    answer(TestBed.inject(HttpTestingController));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('Ariel → Editar → Cuándo → otra fecha → vuelve a la revisión con la fecha, Ariel y "Pedir presupuesto a Ariel"', async () => {
    setup();
    const store = targetAriel();
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.editFromQuote();
    const { fixture, el } = await openFlow();
    expect(visibleText(el)).toContain('Vas a pedir presupuesto a');
    expect(visibleText(el)).toContain('Ariel Jesús Suasnabar');
    expect(visibleText(el)).toContain('Reparación de PC · Atiende urgencias');
    expect(byText(el, 'Ver profesionales disponibles')).toBeUndefined();

    byLabel(el, 'Editar Cuándo')!.click();
    fixture.detectChanges();
    byText(el, 'Elegir fecha')?.click() ??
      buttons(el)
        .find((b) => b.textContent?.includes('Elegir fecha'))!
        .click();
    fixture.detectChanges();
    const target = store.dateFor(7);
    const label = formatDesiredDate(target);
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    await sleep(320);
    fixture.detectChanges();

    expect(store.step()).toBe(REQUEST_STEPS.review);
    expect(store.draft().desiredDate).toBe(target);
    expect(store.targeted()).toBe(true);
    const rows = visibleText(el);
    expect(rows).toContain(`Puede esperar · ${label}`);
    expect(byText(el, 'Pedir presupuesto a Ariel')).toBeDefined();
    expect(byText(el, 'Ver profesionales disponibles')).toBeUndefined();

    byText(el, 'Pedir presupuesto a Ariel')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/presupuesto');
    expect(store.returnToQuote()).toBe(false);
  });

  it('descubriendo: "Ver profesionales disponibles"; faltantes como pendientes y sin "Reparación de PC · Reparación de PC"', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.updateTitle('Reparación de PC');
    store.goToStep(REQUEST_STEPS.review);
    const { el } = await openFlow();
    const text = visibleText(el);
    expect(byText(el, 'Ver profesionales disponibles')).toBeDefined();
    expect(text).not.toContain('Reparación de PC · Reparación de PC');
    expect(text).toContain('Falta elegir');
    expect(byLabel(el, 'Completar Dónde')).not.toBeNull();
    expect(text).toContain('Falta completar');
    expect(text).not.toMatch(/Barrio sin elegir|Sin descripción/);
    expect(serviceAndTitle('Reparación de PC', 'Reparacion de pc')).toBe('Reparación de PC');
  });

  it('descubriendo: incluye al PRO destacado en su posición orgánica, marcados, y envía a los que quedan', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.goToStep(REQUEST_STEPS.review);
    const fixture = TestBed.createComponent(RequestFlowPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const villaOnly = ariel({
      id: BRUNO,
      firstName: 'Bruno',
      displayName: 'Bruno Villa',
      zones: [{ id: VILLA.id, name: VILLA.name, slug: VILLA.slug }],
    });
    const featured = ariel({ id: '99999999-9999-4999-8999-999999999991', firstName: 'Carla', displayName: 'Carla Paga', isFeaturedPlacement: true, pro: true });
    const dario = ariel({
      id: '99999999-9999-4999-8999-999999999992',
      firstName: 'Darío',
      displayName: 'Darío Centro',
      averageRating: 4.7,
      reviewsCount: 9,
      averageResponseMinutes: 40,
    });
    for (const req of http.match((r) => r.url.endsWith('/professionals'))) {
      expect(req.request.params.get('sort') === 'organic' || !req.request.params.has('sort')).toBe(true);
      req.flush({ items: req.request.params.get('sort') === 'organic' ? [ariel(), dario, { ...featured, isFeaturedPlacement: false }, villaOnly] : [featured, ariel(), villaOnly, dario], total: 4, page: 1, pageSize: 20 });
    }
    answer(http);
    fixture.detectChanges();
    // El backend dice quién puede RESPONDER: ambos candidatos de Centro pueden.
    const check = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    expect(check.request.body).toMatchObject({ serviceId: PC.id, zoneId: CENTRO.id, urgency: 'FLEXIBLE' });
    expect(check.request.body.professionalIds).toEqual([ARIEL, dario.id, featured.id]);
    check.flush({ eligibleIds: [ARIEL, dario.id, featured.id] });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const block = el.querySelector('[data-testid="suggested"]')!;
    expect(visibleText(block as HTMLElement)).toContain('Ninguno pagó por estar acá');
    const names = [...block.querySelectorAll('[data-testid="suggested-pro"]')].map((l) => visibleText(l as HTMLElement));
    expect(names).toHaveLength(3);
    expect(names[0]).toContain('Ariel Jesús Suasnabar');
    expect(names[1]).toContain('Darío Centro');
    expect(names[1]).toContain('4,7 · 9 reseñas · Suele responder en menos de 1 h');
    expect(names[2]).toContain('Carla Paga');
    expect(byText(el, 'Pedir presupuesto a los 3')).toBeDefined();
    expect(byText(el, 'Ver todos los profesionales')).toBeDefined();
    // Saca a Darío: queda Ariel solo (sigue siendo un pedido abierto, no dirigido).
    block.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();
    block.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2].click();
    fixture.detectChanges();
    byText(el, 'Pedir presupuesto a Ariel')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/presupuesto');
    expect(store.recipientIds()).toEqual([ARIEL]);
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(store.attributionSource()).toBe('MARKETPLACE_DISCOVERY');
    expect(store.draft().zone?.id).toBe(CENTRO.id);
  });

  /** Abre el último paso con candidatos de Centro y devuelve lo necesario para responder la consulta. */
  async function openSuggestions() {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.goToStep(REQUEST_STEPS.review);
    const fixture = TestBed.createComponent(RequestFlowPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const dario = ariel({ id: '99999999-9999-4999-8999-999999999992', firstName: 'Darío', displayName: 'Darío Centro' });
    const elena = ariel({ id: '99999999-9999-4999-8999-999999999993', firstName: 'Elena', displayName: 'Elena Centro' });
    for (const req of http.match((r) => r.url.endsWith('/professionals'))) {
      req.flush({ items: [ariel(), dario, elena], total: 3, page: 1, pageSize: 20 });
    }
    answer(http);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const check = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    return { fixture, el, check, store, dario, elena, http };
  }

  it('sugeridos: no ofrece a quien el backend dice que no puede responder (cupo, solicitudes apagadas…)', async () => {
    const { fixture, el, check, store, elena } = await openSuggestions();
    expect(visibleText(el)).toContain('Buscando quién puede responder tu pedido');
    expect(el.querySelector('[data-testid="suggested"]')).toBeNull();
    // Ariel y Darío no pueden responder; solo Elena.
    check.flush({ eligibleIds: [elena.id] });
    await fixture.whenStable();
    fixture.detectChanges();
    const block = el.querySelector('[data-testid="suggested"]')!;
    const names = [...block.querySelectorAll('[data-testid="suggested-pro"]')].map((l) => visibleText(l as HTMLElement));
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Elena Centro');
    expect(visibleText(el)).not.toContain('Ariel Jesús Suasnabar');
    byText(el, 'Pedir presupuesto a Elena')!.click();
    await fixture.whenStable();
    expect(store.recipientIds()).toEqual([elena.id]);
  });

  it('sugeridos: si nadie puede responder, lo dice claro y no recomienda perfiles incompatibles', async () => {
    const { fixture, el, check } = await openSuggestions();
    check.flush({ eligibleIds: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="suggested"]')).toBeNull();
    expect(el.querySelector('[data-testid="ask-suggested"]')).toBeNull();
    const none = el.querySelector('[data-testid="suggested-none"]')!;
    expect(visibleText(none as HTMLElement)).toContain('No encontramos sugerencias disponibles para este pedido');
    expect(byText(el, 'Ver todos los profesionales')).toBeDefined();
    expect(byText(el, 'Ver profesionales disponibles')).toBeUndefined();
    expect(visibleText(el)).not.toContain('Ariel Jesús Suasnabar');
  });

  it('sugeridos: con 13 candidatos solo se revisan 12; si esos no sirven, no afirma que no exista nadie disponible', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.goToStep(REQUEST_STEPS.review);
    const fixture = TestBed.createComponent(RequestFlowPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    const pid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
    const items = Array.from({ length: 13 }, (_, i) => ariel({ id: pid(i + 1), firstName: `Pro${i + 1}`, displayName: `Pro ${i + 1} Centro` }));
    for (const req of http.match((r) => r.url.endsWith('/professionals'))) {
      req.flush({ items, total: 13, page: 1, pageSize: 20 });
    }
    answer(http);
    fixture.detectChanges();
    const check = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    // Solo viajan los primeros 12: el 13 (que sí podría responder) no se consulta.
    expect(check.request.body.professionalIds).toEqual(items.slice(0, 12).map((p) => p.id));
    check.flush({ eligibleIds: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = visibleText(el.querySelector('[data-testid="suggested-none"]') as HTMLElement);
    expect(text).toContain('No encontramos sugerencias disponibles para este pedido');
    expect(text).toContain('Revisamos una selección del listado');
    expect(text).toContain('contacto directo');
    expect(visibleText(el)).not.toMatch(/nadie puede responder|no existe nadie|dejaron de recibir|ningún profesional/i);
    expect(el.querySelector('[data-testid="suggested-pro"]')).toBeNull();
    expect(byText(el, 'Ver todos los profesionales')).toBeDefined();
  });

  it('sugeridos: si no se pudo verificar, no recomienda a ciegas y deja el listado completo', async () => {
    const { fixture, el, check } = await openSuggestions();
    check.flush({ message: 'x' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="suggested-pro"]')).toBeNull();
    expect(el.querySelector('[data-testid="suggested-unverified"]')).not.toBeNull();
    expect(byText(el, 'Ver todos los profesionales')).toBeDefined();
  });

  it('sugeridos: al cambiar el pedido se vuelve a consultar con lo nuevo', async () => {
    const { fixture, el, check, store, http, elena } = await openSuggestions();
    check.flush({ eligibleIds: [elena.id] });
    await fixture.whenStable();
    fixture.detectChanges();
    store.updateDraft({ urgency: 'URGENT' }, false);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/professionals') && r.params.get('sort') === 'organic').flush({ items: [elena], total: 1, page: 1, pageSize: 20 });
    fixture.detectChanges();
    const again = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    expect(again.request.body.urgency).toBe('URGENT');
    // Mientras tanto no se muestran sugeridos viejos.
    expect(el.querySelector('[data-testid="suggested-pro"]')).toBeNull();
    again.flush({ eligibleIds: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="suggested-none"]')).not.toBeNull();
  });

  it('barrio incompatible: explica y ofrece "Buscar profesionales" (única ruptura del target)', async () => {
    setup();
    const store = targetAriel();
    store.setZone(VILLA);
    store.editFromQuote();
    const { fixture, el } = await openFlow();
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain(
      'Ariel ya no puede recibir este pedido con los cambios que hiciste.',
    );
    expect(alert.textContent).toContain('Ariel no trabaja en Villa Italia.');
    expect(byText(el, 'Pedir presupuesto a Ariel')).toBeUndefined();
    buttons(alert)
      .find((b) => b.textContent?.includes('Buscar profesionales'))!
      .click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/profesionales?pedido=1');
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(store.draft().zone?.id).toBe(VILLA.id);
  });

  it('dirigido: elegir "Es una urgencia" no manda a Urgencias (no se pierde a Ariel)', async () => {
    setup();
    const store = targetAriel();
    store.editStep(REQUEST_STEPS.when);
    const { fixture, el } = await openFlow();
    buttons(el)
      .find(
        (b) => b.getAttribute('role') === 'radio' && b.textContent?.includes('Es una urgencia'),
      )!
      .click();
    await sleep(320);
    fixture.detectChanges();
    expect(TestBed.inject(Router).url).not.toBe('/urgencias');
    expect(store.draft().urgency).toBe('URGENT');
    expect(store.targeted()).toBe(true);
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });
});

describe('"Solicitar presupuesto" dirigido', () => {
  it('copy real ("se enviará a Ariel", nunca "hasta 3") y "Editar" vuelve a esta misma pantalla', async () => {
    setup();
    const store = targetAriel();
    const fixture = TestBed.createComponent(QuoteRequestPage);
    fixture.detectChanges();
    answer(TestBed.inject(HttpTestingController));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = visibleText(el);
    expect(text).toContain('Tu pedido se enviará a Ariel.');
    expect(text).toContain('antes de enviarlo podés sumar hasta 5 profesionales más');
    expect(text).not.toContain('hasta 3 profesionales');
    expect(text).toContain('A coordinar');
    byText(el, 'Editar')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/solicitud');
    expect(store.returnToQuote()).toBe(true);
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });
});

describe('"Sumá otro para comparar": solo quien puede responder', () => {
  async function open() {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.addRecipient(ariel());
    // Como al venir de resultados: el listado del servicio ya está cargado.
    TestBed.inject(ProfessionalsStore).setFilters({ serviceId: PC.id, licenseVerified: false });
    const fixture = TestBed.createComponent(QuoteRequestPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const dario = ariel({ id: '99999999-9999-4999-8999-999999999992', firstName: 'Darío', displayName: 'Darío Centro' });
    const elena = ariel({ id: '99999999-9999-4999-8999-999999999993', firstName: 'Elena', displayName: 'Elena Centro' });
    const villa = ariel({
      id: BRUNO,
      firstName: 'Bruno',
      displayName: 'Bruno Villa',
      zones: [{ id: VILLA.id, name: VILLA.name, slug: VILLA.slug }],
    });
    for (const req of http.match((r) => r.url.endsWith('/professionals'))) {
      req.flush({ items: [ariel(), dario, elena, villa], total: 4, page: 1, pageSize: 20 });
    }
    answer(http);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http, dario, elena };
  }

  it('consulta al backend y ofrece solo a quien puede responder (ni a quien no cubre el barrio)', async () => {
    const { fixture, el, http, dario, elena } = await open();
    const check = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    // Ariel ya está elegido y Bruno no cubre Centro: no se consultan.
    expect(check.request.body.professionalIds).toEqual([dario.id, elena.id]);
    expect(visibleText(el)).not.toContain('Sumá otro para comparar');
    check.flush({ eligibleIds: [elena.id] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(visibleText(el)).toContain('Sumá otro para comparar');
    expect(visibleText(el)).toContain('+ Elena');
    expect(visibleText(el)).not.toContain('+ Darío');
    expect(visibleText(el)).not.toContain('+ Bruno');
  });

  it('si ninguno puede responder (o no se pudo verificar) no ofrece a nadie', async () => {
    const { fixture, el, http } = await open();
    http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients')).flush({ message: 'x' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(visibleText(el)).not.toContain('Sumá otro para comparar');
  });
});

describe('Urgencias: cualquier servicio', () => {
  async function openUrgent() {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UrgentPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('conserva descripción y barrio cuando se continúa explícitamente desde Crear solicitud', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.updateDraft({ description: 'La PC no enciende desde ayer', zone: CENTRO });
    const { http, fixture, el } = await openUrgent();
    fixture.componentRef.setInput('pedido', '1');
    http
      .expectOne((r) => r.url === `${API}/professionals` && !r.params.has('service'))
      .flush({ items: [ariel()], total: 1, page: 1, pageSize: 20 });
    fixture.detectChanges();
    buttons(el)
      .find((button) => button.textContent?.includes('Pedir presupuesto urgente'))!
      .click();
    await fixture.whenStable();
    expect(store.draft()).toMatchObject({
      service: { id: PC.id },
      description: 'La PC no enciende desde ayer',
      zone: CENTRO,
      urgency: 'URGENT',
    });
    expect(TestBed.inject(Router).url).toBe('/presupuesto');
  });

  it('los rubros son atajos; "Otro servicio" busca en el catálogo real (Reparación de PC)', async () => {
    setup();
    const { http, fixture, el } = await openUrgent();
    http
      .expectOne(
        (r) =>
          r.url === `${API}/professionals` &&
          !r.params.has('service') &&
          r.params.get('availableToday') === 'true',
      )
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });
    const other = buttons(el).find((b) => b.textContent?.includes('Otro servicio'))!;
    expect(other.getAttribute('aria-expanded')).toBe('false');
    other.click();
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#urgent-service')!;
    input.value = 'pc';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    buttons(el)
      .find((b) => b.textContent?.includes('Reparación de PC'))!
      .click();
    fixture.detectChanges();
    const req = http.expectOne(
      (r) => r.url === `${API}/professionals` && r.params.get('service') === PC.id,
    );
    expect(req.request.params.get('availableToday')).toBe('true');
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    fixture.detectChanges();
    const text = visibleText(el);
    expect(text).toContain('Todavía nadie atiende urgencias en Tandil para Reparación de PC.');
    expect(text).toContain('Ver profesionales');
    expect(text).toContain('Podés crear una solicitud de Reparación de PC');
    // No cambia de servicio solo.
    expect(el.querySelector('button[aria-pressed="true"]')?.textContent?.trim()).toBe(
      'Reparación de PC',
    );

    byText(el, 'Crear solicitud')!.click();
    await fixture.whenStable();
    const store = TestBed.inject(RequestStore);
    expect(store.draft()).toMatchObject({ service: { id: PC.id }, urgency: 'TODAY' });
    expect(store.flowMode()).toBe('DISCOVERY');
    expect(TestBed.inject(Router).url).toBe('/solicitud');
  });

  it('la entrada general ignora el servicio anterior y pedir urgente inicia un pedido dirigido limpio', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    const { http, fixture, el } = await openUrgent();
    store.updateDraft({
      description: 'Problema anterior',
      zone: CENTRO,
      desiredDate: '2026-10-09',
    });
    // La búsqueda general no hereda Reparación de PC del borrador.
    http
      .expectOne(
        (r) =>
          r.url === `${API}/professionals` &&
          !r.params.has('service') &&
          r.params.get('availableToday') === 'true',
      )
      .flush({ items: [ariel()], total: 1, page: 1, pageSize: 20 });
    fixture.detectChanges();
    buttons(el)
      .find((b) => b.textContent?.includes('Pedir presupuesto urgente'))!
      .click();
    await fixture.whenStable();
    // No hereda la descripción ni el barrio anteriores. El servicio sale del profesional elegido (ofrece uno solo).
    expect(store.draft()).toMatchObject({
      service: { id: PC.id },
      urgency: 'URGENT',
      description: '',
      zone: null,
      desiredDate: businessDay(),
    });
    expect(store.targeted()).toBe(true);
    expect(store.recipientIds()).toEqual([ARIEL]);
    expect(TestBed.inject(Router).url).toBe('/solicitud');
  });
});

describe('medición del recorrido del pedido (anónima)', () => {
  const JOURNEY_URL = `${API}/analytics/request-journey`;
  const flushJourney = (http: HttpTestingController) =>
    http.match(JOURNEY_URL).map((r) => {
      r.flush({ accepted: 1 });
      return r.request.body as { attemptId: string; journey: string; flowVersion?: number; events: { type: string; step?: number }[] };
    });

  it('un pedido que arma en /solicitud es REQUEST y su envío lleva la clave del intento', async () => {
    vi.useFakeTimers();
    const http = setup();
    const store = TestBed.inject(RequestStore);
    store.setService(PC);
    store.updateDescription('Se me rompió la fuente de la notebook.');
    store.trackStepViewed(0);
    store.trackStepViewed(REQUEST_STEPS.review);
    store.trackStepViewed(REQUEST_STEPS.review);
    vi.advanceTimersByTime(2500);
    const [body] = flushJourney(http);
    expect(body.journey).toBe('REQUEST');
    expect(body.flowVersion).toBe(2); // la interfaz que realmente emitió los eventos
    expect(body.events.map((e) => `${e.type}${e.step ?? ''}`)).toEqual(['STARTED', 'STEP_VIEWED0', 'STEP_VIEWED3']);
    expect(JSON.stringify(body)).not.toContain('fuente de la notebook');

    // Envío: la clave viaja con las invitaciones y el intento se cierra al enviar.
    store.askProfessionals([ariel()], 'DISCOVERY');
    store.updateDraft({ zone: CENTRO });
    const promise = store.send();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(`${API}/requests`).flush({ id: '99999999-9999-4999-8999-999999999999' });
    await vi.advanceTimersByTimeAsync(0);
    const invite = http.expectOne(`${API}/requests/99999999-9999-4999-8999-999999999999/invitations`);
    expect(invite.request.body.journeyAttemptId).toBe(body.attemptId);
    invite.flush({ id: '99999999-9999-4999-8999-999999999999', status: 'WAITING_QUOTES' });
    await promise;
    // Nuevo pedido = nuevo intento.
    store.trackStepViewed(0);
    vi.advanceTimersByTime(2500);
    const [next] = flushJourney(http);
    expect(next.attemptId).not.toBe(body.attemptId);
  });

  it('si el envío falla, el intento sigue: el reintento lleva la misma clave', async () => {
    vi.useFakeTimers();
    const http = setup();
    const store = targetAriel();
    store.updateDescription('Se me rompió la fuente de la notebook.');
    store.updateDraft({ zone: CENTRO });
    store.trackQuoteViewed();
    vi.advanceTimersByTime(2500);
    const [body] = flushJourney(http);
    expect(body.journey).toBe('DIRECT'); // un profesional elegido
    const attempts: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const p = store.send();
      await vi.advanceTimersByTimeAsync(0);
      if (i === 0) http.expectOne(`${API}/requests`).flush({ id: '99999999-9999-4999-8999-999999999999' });
      else http.expectOne(`${API}/requests/99999999-9999-4999-8999-999999999999`).flush({});
      await vi.advanceTimersByTimeAsync(0);
      const invite = http.expectOne(`${API}/requests/99999999-9999-4999-8999-999999999999/invitations`);
      attempts.push(invite.request.body.journeyAttemptId);
      if (i === 0) invite.flush({ message: 'x' }, { status: 500, statusText: 'Error' });
      else invite.flush({ id: '99999999-9999-4999-8999-999999999999', status: 'WAITING_QUOTES' });
      await p;
      if (i === 0) expect(store.sendError()).toBeTruthy();
    }
    expect(attempts).toEqual([body.attemptId, body.attemptId]);
  });

  it('varios elegidos desde resultados, directo a /presupuesto, son COMPARE', () => {
    vi.useFakeTimers();
    const http = setup();
    const search = TestBed.inject(SearchStore);
    search.explore(null);
    search.prepareRequest([ariel(), ariel({ id: BRUNO, firstName: 'Bruno', displayName: 'Bruno' })], 'DISCOVERY', 'MULTI_SELECT');
    const store = TestBed.inject(RequestStore);
    store.trackQuoteViewed();
    vi.advanceTimersByTime(2500);
    const [body] = flushJourney(http);
    expect(body.journey).toBe('COMPARE');
    expect(body.events[0]).toEqual({ type: 'STARTED', entry: 'MULTI_SELECT' });
  });

  it('descartar el pedido cierra el intento', () => {
    vi.useFakeTimers();
    const http = setup();
    const store = targetAriel();
    store.trackQuoteViewed();
    vi.advanceTimersByTime(2500);
    const [first] = flushJourney(http);
    store.discard();
    store.trackStepViewed(0);
    vi.advanceTimersByTime(2500);
    expect(flushJourney(http)[0].attemptId).not.toBe(first.attemptId);
  });
});

describe('el intento de medición vive y vence con el borrador', () => {
  const HOUR = 3600 * 1000;
  const attemptOf = () => JSON.parse(sessionStorage.getItem(DRAFT_KEY)!).journey as { id: string; journey: string } | null;
  const reload = () => {
    TestBed.resetTestingModule();
    return setup();
  };
  const T0 = new Date('2026-10-16T12:00:00-03:00').getTime();

  it('inicio, edición a las 11 h y recarga a las 13 h: el borrador vigente conserva su intento y su recorrido', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    setup();
    const store = targetAriel();
    store.trackStepViewed(0);
    TestBed.tick();
    const original = attemptOf()!;
    expect(original.journey).toBe('DIRECT');

    // A las 11 h edita: el borrador renueva su vigencia (y el intento, que viaja adentro).
    vi.setSystemTime(T0 + 11 * HOUR);
    store.updateDraft({ desiredDate: '2026-10-20' });
    TestBed.tick();
    expect(attemptOf()).toEqual(original);

    // A las 13 h (13 h desde el inicio, 2 h desde la última edición) el borrador sigue vigente.
    vi.setSystemTime(T0 + 13 * HOUR);
    const http = reload();
    const restored = TestBed.inject(RequestStore);
    expect(restored.draft().desiredDate).toBe('2026-10-20');
    restored.trackQuoteViewed();
    TestBed.tick();
    expect(attemptOf()).toEqual(original);
    // Y lo que se mida sigue siendo del mismo intento y recorrido (sin otro STARTED).
    vi.useFakeTimers();
    restored.trackQuoteViewed();
    vi.advanceTimersByTime(2500);
    const sent = http.match(`${API}/analytics/request-journey`).map((r) => r.request.body as { attemptId: string; journey: string; events: { type: string }[] });
    sent.forEach((r) => expect(r).toMatchObject({ attemptId: original.id, journey: 'DIRECT' }));
    expect(sent.flatMap((r) => r.events.map((e) => e.type))).not.toContain('STARTED');
  });

  it('vencimiento real: sin ediciones por más de 12 h el borrador y su intento se cierran juntos', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    setup();
    const store = targetAriel();
    store.trackStepViewed(0);
    TestBed.tick();
    const original = attemptOf()!;

    vi.setSystemTime(T0 + 12 * HOUR + 1000);
    reload();
    const restored = TestBed.inject(RequestStore);
    expect(restored.hasContext()).toBe(false); // el borrador venció
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    // El próximo pedido es otro intento.
    const fresh = targetAriel();
    fresh.trackStepViewed(0);
    TestBed.tick();
    expect(attemptOf()!.id).not.toBe(original.id);
  });

  it('enviar, descartar o reemplazar el pedido cierra el intento guardado', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    setup();
    const store = targetAriel();
    store.trackStepViewed(0);
    TestBed.tick();
    const first = attemptOf()!;
    store.discard();
    TestBed.tick();
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    const second = targetAriel();
    second.trackStepViewed(0);
    TestBed.tick();
    const next = attemptOf()!;
    expect(next.id).not.toBe(first.id);
    // Reemplazarlo por un pedido nuevo también lo cierra.
    second.resetForNewRequest();
    second.updateDraft({ title: 'Otro pedido' });
    TestBed.tick();
    expect(attemptOf()).toBeNull();
  });
});


describe('selección manual: verificar a todos antes de enviar', () => {
  async function selected() {
    const http = setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest(); store.setService(PC); store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.');
    store.askProfessionals([ariel(), ariel({ id: BRUNO, firstName: 'Bruno', displayName: 'Bruno' })], 'DISCOVERY');
    const fixture = TestBed.createComponent(QuoteRequestPage); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    const check = http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients'));
    return { http, store, fixture, check, el: fixture.nativeElement as HTMLElement };
  }
  it('nombra al no disponible y conserva a todos hasta que el cliente confirma; el restante sigue discovery', async () => {
    const { http, store, fixture, check, el } = await selected();
    expect(check.request.body.professionalIds).toEqual([ARIEL, BRUNO]);
    check.flush({ eligibleIds: [ARIEL] }); await fixture.whenStable(); fixture.detectChanges();
    expect(visibleText(el)).toContain('Bruno no puede responder este pedido');
    expect(store.recipientIds()).toEqual([ARIEL, BRUNO]);
    http.expectNone(`${API}/requests`);
    buttons(el).find((b) => b.textContent?.includes('Quitar a quienes no pueden responder'))!.click();
    fixture.detectChanges();
    expect(store.recipientIds()).toEqual([ARIEL]);
    expect(store.targeted()).toBe(false);
    expect(store.draft().description).toContain('La PC no prende');
    http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients')).flush({ eligibleIds: [ARIEL] });
    await fixture.whenStable(); fixture.detectChanges();
    expect(visibleText(el)).not.toContain('Bruno no puede responder');
    http.expectNone(`${API}/requests`);
  });
  it('si falla la comprobación no acusa a nadie; permite reintentar y buscar otra selección si ninguno puede', async () => {
    const { http, store, fixture, check, el } = await selected();
    check.flush({}, { status: 503, statusText: 'Unavailable' }); await fixture.whenStable(); fixture.detectChanges();
    expect(visibleText(el)).toContain('No pudimos comprobar');
    expect(visibleText(el)).not.toContain('Bruno no puede responder');
    expect(store.recipientIds()).toEqual([ARIEL, BRUNO]);
    buttons(el).find((b) => b.textContent?.includes('Reintentar comprobación'))!.click(); fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/requests/eligible-recipients')).flush({ eligibleIds: [] });
    await fixture.whenStable(); fixture.detectChanges();
    expect(visibleText(el)).toContain('Buscar otros profesionales');
    http.expectNone(`${API}/requests`);
  });
});
