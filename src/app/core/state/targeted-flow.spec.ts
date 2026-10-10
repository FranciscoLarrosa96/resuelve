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
import { formatDesiredDate } from '../utils/dates';
import { CatalogStore } from './catalog.store';
import { RequestStore, serviceAndTitle } from './request.store';
import { SearchStore } from './search.store';
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

/** Ariel: Reparación de PC, solo Centro, toma urgencias. */
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
    store.updateDescription('La PC no prende desde ayer a la noche.', false);
    store.updateTitle('No prende la PC');
    expect(store.draft().desiredDate).toBe('2026-10-04');
    expect(store.targeted()).toBe(true);
    expect(store.targetProblems()).toEqual([]);
    expect(store.issues()).toEqual([]);
  });

  it('urgencia: sigue si Ariel toma urgencias ahora; si no, se explica (no se rompe en silencio)', () => {
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
    store.updateDescription('La PC no prende desde ayer a la noche.', false);
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

  it('Ariel → Editar → Cuándo → otra fecha → vuelve a la revisión con la fecha, Ariel y "Solicitar presupuesto a Ariel"', async () => {
    setup();
    const store = targetAriel();
    store.setZone(CENTRO);
    store.updateDescription('La PC no prende desde ayer a la noche.', false);
    store.editFromQuote();
    const { fixture, el } = await openFlow();
    expect(visibleText(el)).toContain('Vas a pedir presupuesto a');
    expect(visibleText(el)).toContain('Ariel Jesús Suasnabar');
    expect(visibleText(el)).toContain('Reparación de PC · Toma urgencias');
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

    expect(store.step()).toBe(4);
    expect(store.draft().desiredDate).toBe(target);
    expect(store.targeted()).toBe(true);
    const rows = visibleText(el);
    expect(rows).toContain(`Cuándo${label}Editar`);
    expect(byText(el, 'Solicitar presupuesto a Ariel')).toBeDefined();
    expect(byText(el, 'Ver profesionales disponibles')).toBeUndefined();

    byText(el, 'Solicitar presupuesto a Ariel')!.click();
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
    store.goToStep(4);
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
    expect(byText(el, 'Solicitar presupuesto a Ariel')).toBeUndefined();
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
    store.editStep(1);
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
    expect(store.step()).toBe(4);
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
    expect(store.step()).toBe(4);
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
    expect(text).toContain('No encontramos profesionales que tomen urgencias ahora en Tandil para Reparación de PC.');
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
    expect(store.draft()).toMatchObject({
      service: { id: null, slug: '' },
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
