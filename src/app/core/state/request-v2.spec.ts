import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { FLUSH_DELAY_MS } from '../analytics/exposure-tracker';
import { RequestJourneyTracker } from '../analytics/request-journey-tracker';
import { Category, Service, Zone } from '../models/category';
import { ProfessionalSummary } from '../models/professional';
import { FLOW_STEPS, REQUEST_STEPS } from '../models/service-request';
import { businessDay } from '../utils/business-time';
import { CatalogStore } from './catalog.store';
import { RequestStore } from './request.store';
import { SearchStore } from './search.store';
import { useTestLocality } from './locality.testing';
import { RequestFlowPage } from '../../features/client/request-flow/request-flow-page';
import { QuoteRequestPage } from '../../features/client/quote-request/quote-request-page';
import { UrgentPage } from '../../features/client/urgent/urgent-page';

/**
 * Pedido V2 (asistente de 4 pasos, urgencia + fecha juntas, /presupuesto corto, Urgencias que
 * conserva el contexto). HTTP mockeado: nunca llama a Render.
 */
const API = 'http://api.test/api/v1';
const ARIEL = '22222222-2222-4222-8222-222222222222';
const CENTRO: Zone = { id: '44444444-4444-4444-8444-444444444444', name: 'Centro', slug: 'centro', cityId: 'c' };
const PC: Service = { id: '66666666-6666-4666-8666-666666666666', name: 'Reparación de PC', slug: 'reparacion-de-pc', categoryId: 'tec', requiresLicense: false };
const GAS: Service = { id: '77777777-7777-4777-8777-777777777777', name: 'Gas', slug: 'gas', categoryId: 'hogar', requiresLicense: false };
const PLOMERIA: Service = { id: '88888888-8888-4888-8888-888888888888', name: 'Plomería', slug: 'plomeria', categoryId: 'hogar', requiresLicense: false };
const CATEGORIES: Category[] = [
  { id: 'hogar', name: 'Hogar', slug: 'hogar' } as Category,
  { id: 'tec', name: 'Tecnología', slug: 'tecnologia' } as Category,
];
const SERVICES = [PC, GAS, PLOMERIA];
const DESCRIPTION = 'La PC no prende desde ayer a la noche.';

const pro = (services: Service[] = [PC], overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
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
  services: services.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
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
const byText = (el: Element, text: string) => buttons(el).find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() === text);
const byTextIncluding = (el: Element, text: string) => buttons(el).find((b) => (b.textContent ?? '').includes(text));
const visibleText = (el: HTMLElement) => el.textContent!.replace(/\s+/g, ' ');
function answer(http: HttpTestingController) {
  for (const req of http.match(() => true) as TestRequest[]) {
    if (req.cancelled) continue;
    if (req.request.url.endsWith('/zones')) req.flush([CENTRO]);
    else if (req.request.url.endsWith('/professionals')) req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
  }
}

async function openFlow() {
  const fixture = TestBed.createComponent(RequestFlowPage);
  fixture.detectChanges();
  await fixture.whenStable();
  answer(TestBed.inject(HttpTestingController));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function openQuote() {
  const fixture = TestBed.createComponent(QuoteRequestPage);
  fixture.detectChanges();
  await fixture.whenStable();
  answer(TestBed.inject(HttpTestingController));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Pedido de descubrimiento ya armado (como llega del inicio). */
function homeDraft(): RequestStore {
  const store = TestBed.inject(RequestStore);
  store.resetForNewRequest();
  store.setService(PC);
  store.updateDescription(DESCRIPTION);
  return store;
}

function typeInto(fixture: { detectChanges(): void }, field: HTMLTextAreaElement | HTMLInputElement, text: string) {
  field.value = text;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.useRealTimers());

describe('pasos por significado', () => {
  it('son cuatro (qué, dónde, cuándo, revisión) y la revisión es la última', () => {
    expect(REQUEST_STEPS).toEqual({ what: 0, where: 1, when: 2, review: 3 });
    expect(FLOW_STEPS).toBe(4);
    setup();
    const store = TestBed.inject(RequestStore);
    store.goToStep(REQUEST_STEPS.when);
    store.next();
    expect(store.step()).toBe(REQUEST_STEPS.review);
    store.next();
    expect(store.step()).toBe(REQUEST_STEPS.review); // no pasa de la revisión
    expect(store.progress()).toBe(100);
  });

  it('editar una fila desde la revisión abre ESE paso y al terminar vuelve a la revisión', () => {
    setup();
    const store = homeDraft();
    store.goToStep(REQUEST_STEPS.review);
    store.editStep(REQUEST_STEPS.when);
    expect(store.step()).toBe(REQUEST_STEPS.when);
    store.next();
    expect(store.step()).toBe(REQUEST_STEPS.review);
    store.editStep(REQUEST_STEPS.what);
    store.previous();
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });
});

describe('Cuándo: urgencia + fecha (reglas de updateDraft sin cambios)', () => {
  const today = () => businessDay();
  const fresh = () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    return store;
  };

  it('un pedido nuevo puede esperar y todavía no tiene día', () => {
    const store = fresh();
    expect(store.draft()).toMatchObject({ urgency: 'FLEXIBLE', desiredDate: null });
    expect(store.whenSummary()).toBe('Puede esperar · A coordinar');
  });

  it('URGENT y TODAY fijan la fecha de hoy', () => {
    const store = fresh();
    store.updateDraft({ urgency: 'URGENT' });
    expect(store.draft()).toMatchObject({ urgency: 'URGENT', desiredDate: today() });
    store.updateDraft({ urgency: 'TODAY' });
    expect(store.draft()).toMatchObject({ urgency: 'TODAY', desiredDate: today() });
  });

  it('elegir otro día deja el pedido en FLEXIBLE aunque venga de TODAY o URGENT', () => {
    const store = fresh();
    store.updateDraft({ urgency: 'TODAY' });
    store.updateDraft({ desiredDate: store.dateFor(1) });
    expect(store.draft().urgency).toBe('FLEXIBLE');
    store.updateDraft({ urgency: 'URGENT' });
    store.updateDraft({ desiredDate: store.dateFor(3) });
    expect(store.draft().urgency).toBe('FLEXIBLE');
  });

  it('pasar de URGENT a "Puede esperar" conserva hoy; "Hoy, si se puede" NO es "Necesito resolverlo hoy"', () => {
    const store = fresh();
    store.updateDraft({ urgency: 'URGENT' });
    store.updateDraft({ urgency: 'FLEXIBLE' });
    expect(store.draft()).toMatchObject({ urgency: 'FLEXIBLE', desiredDate: today() });
    expect(store.whenSummary()).toMatch(/^Puede esperar · Hoy/);
    // Bajo "Puede esperar", elegir la fecha de hoy sigue siendo FLEXIBLE (no se convierte en TODAY).
    store.updateDraft({ desiredDate: store.dateFor(2) });
    store.updateDraft({ desiredDate: today() });
    expect(store.draft().urgency).toBe('FLEXIBLE');
  });

  it('con URGENT, elegir hoy lo pasa a TODAY; nunca se infiere urgencia del texto', () => {
    const store = fresh();
    store.updateDraft({ urgency: 'URGENT' });
    store.updateDraft({ desiredDate: today() });
    expect(store.draft().urgency).toBe('TODAY');

    store.resetForNewRequest();
    store.updateDescription('URGENTE: se inunda la cocina ahora mismo, es una emergencia');
    expect(store.draft().urgency).toBe('FLEXIBLE');
  });

  it('las tres se leen distinto en el resumen', () => {
    const store = fresh();
    store.updateDraft({ urgency: 'URGENT' });
    const urgent = store.whenSummary();
    store.updateDraft({ urgency: 'TODAY' });
    const todayOnly = store.whenSummary();
    store.updateDraft({ urgency: 'FLEXIBLE' });
    const flexible = store.whenSummary();
    expect(new Set([urgent, todayOnly, flexible]).size).toBe(3);
    expect(urgent).toBe('Es una urgencia · Ahora');
    expect(todayOnly).toBe('Necesito resolverlo hoy');
  });
});

describe('Qué: servicio y descripción', () => {
  it('con un profesional que ofrece UN solo servicio y sin servicio previo, se precarga', async () => {
    setup();
    const search = TestBed.inject(SearchStore);
    search.explore(null);
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.askProfessionals([pro([PC])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    TestBed.tick();
    expect(store.offeredServices()?.map((s) => s.slug)).toEqual(['reparacion-de-pc']);
    expect(store.draft().service.slug).toBe('reparacion-de-pc');
  });

  it('con varios servicios NO elige ninguno y ofrece solo los suyos', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.askProfessionals([pro([PC, GAS])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    store.changingCategory.set(true);
    TestBed.tick();
    expect(store.draft().service.slug).toBe('');
    const { el, fixture } = await openFlow();
    const group = el.querySelector('[data-testid="offered-services"]')!;
    expect(group).not.toBeNull();
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Reparación de PC', 'Gas']);
    expect(visibleText(el)).not.toContain('Plomería');
    byText(group as HTMLElement, 'Gas')!.click();
    fixture.detectChanges();
    expect(store.draft().service.slug).toBe('gas');
  });

  it('un servicio previo incompatible NO se pisa: se explica y se cambia a propósito', async () => {
    setup();
    const store = homeDraft();
    store.askProfessionals([pro([GAS])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    TestBed.tick();
    expect(store.draft().service.slug).toBe('reparacion-de-pc');
    expect(store.draft().description).toBe(DESCRIPTION);
    expect(store.targetProblems().map((p) => p.issue)).toEqual(['service']);
    const { el } = await openFlow();
    expect(visibleText(el)).toContain('Ariel ya no puede recibir este pedido con los cambios que hiciste.');
    expect(visibleText(el)).toContain('Ariel no ofrece Reparación de PC.');
  });

  it('la descripción es obligatoria para seguir: se pide cuando falta o no alcanza', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    const { fixture, el } = await openFlow();
    const next = () => el.querySelector<HTMLButtonElement>('[data-testid="what-continue"]')!;
    expect(next().disabled).toBe(true);
    expect(visibleText(el)).toContain('Contá qué necesitás para continuar (mínimo 10 caracteres).');
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    typeInto(fixture, field, 'corto');
    expect(next().disabled).toBe(true);
    typeInto(fixture, field, 'No arranca la computadora');
    expect(next().disabled).toBe(false);
    next().click();
    expect(store.step()).toBe(REQUEST_STEPS.where);
  });

  it('conserva y deja revisar el texto que ya traía del inicio', async () => {
    setup();
    const store = homeDraft();
    const { fixture, el } = await openFlow();
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(field.value).toBe(DESCRIPTION);
    expect(el.querySelector<HTMLButtonElement>('[data-testid="what-continue"]')!.disabled).toBe(false);
    typeInto(fixture, field, `${DESCRIPTION} Y hace un ruido raro.`);
    expect(store.draft().description).toBe(`${DESCRIPTION} Y hace un ruido raro.`);
  });

  it('editar el texto NUNCA cambia el servicio: lo sugiere y la persona acepta con un toque', async () => {
    setup();
    const store = homeDraft();
    const { fixture, el } = await openFlow();
    typeInto(fixture, el.querySelector<HTMLTextAreaElement>('textarea')!, 'Tengo una pérdida abajo de la pileta');
    expect(store.draft().service.slug).toBe('reparacion-de-pc');
    const hint = el.querySelector('[data-testid="suggested-service"]')!;
    expect(hint.textContent).toContain('Plomería');
    byTextIncluding(hint as HTMLElement, 'Usar Plomería')!.click();
    fixture.detectChanges();
    expect(store.draft().service.slug).toBe('plomeria');
  });

  it('"Entendimos esto" no repite el título cuando es igual al servicio', async () => {
    setup();
    const store = homeDraft();
    store.updateDraft({ title: 'Reparación de PC' });
    const { el } = await openFlow();
    const chips = Array.from(el.querySelectorAll('span.rounded-full')).map((c) => c.textContent!.trim());
    expect(chips.filter((c) => c === 'Reparación de PC')).toHaveLength(2); // uno por layout (desktop y mobile), no dos
  });
});

describe('Cuándo: una sola pantalla', () => {
  async function openWhen() {
    setup();
    const store = homeDraft();
    store.setZone(CENTRO);
    store.goToStep(REQUEST_STEPS.when);
    const { fixture, el } = await openFlow();
    return { store, fixture, el };
  }
  const radio = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((b) => b.textContent!.includes(label))!;

  it('muestra las tres urgencias y los días SOLO bajo "Puede esperar"', async () => {
    const { store, fixture, el } = await openWhen();
    const labels = Array.from(el.querySelectorAll('button[role="radio"]')).slice(0, 3).map((b) => b.querySelector('span.text-base')!.textContent!.trim());
    expect(labels).toEqual(['Es una urgencia', 'Necesito resolverlo hoy', 'Puede esperar']);
    expect(store.draft().urgency).toBe('FLEXIBLE');
    expect(el.querySelector('[data-testid="date-options"]')).not.toBeNull();
    store.updateDraft({ urgency: 'TODAY' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="date-options"]')).toBeNull();
  });

  it('"Puede esperar" pide un día: "Continuar" queda apagado hasta elegirlo y "Hoy, si se puede" sigue siendo FLEXIBLE', async () => {
    const { store, fixture, el } = await openWhen();
    expect(store.draft().desiredDate).toBeNull();
    expect(visibleText(el)).toContain('Elegí un día para continuar.');
    const next = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.trim().startsWith('Continuar'))!;
    expect(next.disabled).toBe(true);
    byTextIncluding(el, 'Hoy, si se puede')!.click();
    fixture.detectChanges();
    expect(store.draft()).toMatchObject({ urgency: 'FLEXIBLE', desiredDate: businessDay() });
    expect(next.disabled).toBe(false);
    await sleep(320);
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });

  it('"Necesito resolverlo hoy" es TODAY (hoy) y avanza solo', async () => {
    const { store, fixture, el } = await openWhen();
    radio(el, 'Necesito resolverlo hoy').click();
    fixture.detectChanges();
    expect(store.draft()).toMatchObject({ urgency: 'TODAY', desiredDate: businessDay() });
    await sleep(320);
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });

  it('"Es una urgencia" sin profesional elegido lleva a Urgencias con el pedido, sin borrarlo', async () => {
    const { store, fixture, el } = await openWhen();
    radio(el, 'Es una urgencia').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/urgencias?pedido=1');
    expect(store.draft()).toMatchObject({ urgency: 'URGENT', description: DESCRIPTION, service: { id: PC.id } });
    expect(store.step()).toBe(REQUEST_STEPS.when); // sin avanzar solo
  });

  it('con un profesional elegido, "Es una urgencia" se queda en el flujo dirigido', async () => {
    setup();
    const store = homeDraft();
    store.setZone(CENTRO);
    store.askProfessionals([pro([PC])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    store.goToStep(REQUEST_STEPS.when);
    const { fixture, el } = await openFlow();
    radio(el, 'Es una urgencia').click();
    fixture.detectChanges();
    await sleep(320);
    expect(TestBed.inject(Router).url).not.toBe('/urgencias?pedido=1');
    expect(store.draft().urgency).toBe('URGENT');
    expect(store.targeted()).toBe(true);
    expect(store.step()).toBe(REQUEST_STEPS.review);
  });
});

describe('Revisión', () => {
  it('muestra servicio, descripción, dónde y cuándo, sin la fila de urgencia ni el servicio repetido', async () => {
    setup();
    const store = homeDraft();
    store.setZone(CENTRO);
    store.updateDraft({ title: 'Reparación de PC' });
    store.goToStep(REQUEST_STEPS.review);
    const { el } = await openFlow();
    const text = visibleText(el);
    for (const row of ['Servicio', 'Descripción', 'Dónde', 'Cuándo']) expect(text).toContain(row);
    expect(text).not.toContain('Urgencia');
    expect(text).not.toContain('Título'); // igual al servicio: no se muestra dos veces
    expect(text).toContain('Puede esperar · A coordinar');
    expect(el.querySelector('[aria-label="Editar Descripción"]')).not.toBeNull();
  });

  it('un título distinto del servicio se muestra y se edita ahí mismo', async () => {
    setup();
    const store = homeDraft();
    store.updateDraft({ title: 'La PC no prende' });
    store.setZone(CENTRO);
    store.goToStep(REQUEST_STEPS.review);
    const { fixture, el } = await openFlow();
    el.querySelector<HTMLButtonElement>('button[aria-label="Editar título"]')!.click();
    fixture.detectChanges();
    typeInto(fixture, el.querySelector<HTMLInputElement>('#edit-title-desktop')!, 'No enciende');
    byText(el, 'Guardar')!.click();
    fixture.detectChanges();
    expect(store.draft().title).toBe('No enciende');
  });

  it('falta la descripción: se marca "Falta completar" y "Completar" abre el paso Qué', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.goToStep(REQUEST_STEPS.review);
    const { fixture, el } = await openFlow();
    expect(visibleText(el)).toContain('Falta completar');
    el.querySelector<HTMLButtonElement>('[aria-label="Completar Descripción"]')!.click();
    fixture.detectChanges();
    expect(store.step()).toBe(REQUEST_STEPS.what);
  });
});

describe('/presupuesto corto', () => {
  function fullTargeted(): RequestStore {
    const store = homeDraft();
    store.setZone(CENTRO);
    store.askProfessionals([pro([PC])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    return store;
  }

  it('con el pedido completo no repite campos: resumen de solo lectura y "Agregar dirección (opcional)"', async () => {
    setup();
    fullTargeted();
    const { fixture, el } = await openQuote();
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.querySelector('app-work-location-picker')).toBeNull();
    const summary = el.querySelector('[data-testid="quote-summary"]')!;
    expect(summary.textContent).toContain('Reparación de PC');
    expect(summary.textContent).toContain(DESCRIPTION);
    expect(summary.textContent).toContain('Centro');
    expect(summary.textContent).toContain('Puede esperar');
    // El servicio y la descripción aparecen una sola vez en el resumen (cada layout tiene el suyo).
    expect((visibleText(el).match(new RegExp(DESCRIPTION.replace('.', '\\.'), 'g')) ?? []).length).toBeLessThanOrEqual(2);
    byTextIncluding(el, 'Agregar dirección (opcional)')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-work-location-picker')).not.toBeNull();
  });

  it('falta la descripción: se abre el campo, sigue abierto al escribir y habilita el envío', async () => {
    setup();
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.setZone(CENTRO);
    store.askProfessionals([pro([PC])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    const { fixture, el } = await openQuote();
    expect(store.issues()).toEqual(['description']);
    const field = el.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(field).not.toBeNull();
    typeInto(fixture, field, 'No arranca la computadora');
    expect(store.issues()).toEqual([]);
    expect(el.querySelector('textarea')).not.toBeNull(); // no desaparece a mitad de camino
  });

  it('falta dónde es el trabajo: se abre el selector de ubicación', async () => {
    setup();
    const store = homeDraft();
    store.askProfessionals([pro([PC])], 'TARGETED', 'DIRECT_PUBLIC_PROFILE');
    const { el } = await openQuote();
    expect(store.issues()).toContain('zone');
    expect(el.querySelector('app-work-location-picker')).not.toBeNull();
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('"Editar" vuelve a la revisión del asistente con el mismo pedido', async () => {
    setup();
    const store = fullTargeted();
    const { fixture, el } = await openQuote();
    el.querySelector<HTMLButtonElement>('button[aria-label="Editar tu pedido"]')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/solicitud');
    expect(store.step()).toBe(REQUEST_STEPS.review);
    expect(store.returnToQuote()).toBe(true);
    expect(store.draft().description).toBe(DESCRIPTION);
  });
});

describe('Urgencias conserva el pedido (D5)', () => {
  async function openUrgent(pro_: ProfessionalSummary) {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UrgentPage);
    fixture.componentRef.setInput('pedido', '1');
    fixture.detectChanges();
    await fixture.whenStable();
    http.match((r) => r.url === `${API}/professionals`).forEach((r) => r.flush({ items: [pro_], total: 1, page: 1, pageSize: 20 }));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function order(): RequestStore {
    const store = homeDraft();
    store.setZone(CENTRO);
    store.updateDraft({ urgency: 'URGENT' });
    return store;
  }

  it('un profesional que ofrece el servicio: sigue el pedido a /presupuesto, sin tocar texto ni servicio', async () => {
    setup();
    const store = order();
    const { fixture, el } = await openUrgent(pro([PC]));
    byTextIncluding(el, 'Pedir presupuesto urgente')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/presupuesto');
    expect(store.draft()).toMatchObject({ description: DESCRIPTION, service: { id: PC.id }, urgency: 'URGENT' });
    expect(store.recipientIds()).toEqual([ARIEL]);
  });

  it('uno que NO lo ofrece: se explica, no se borra ni se sobrescribe nada y se puede elegir otro', async () => {
    setup();
    const store = order();
    const { fixture, el } = await openUrgent(pro([GAS]));
    byTextIncluding(el, 'Pedir presupuesto urgente')!.click();
    fixture.detectChanges();
    const notice = el.querySelector('[data-testid="urgent-incompatible"]')!;
    expect(notice.textContent).toContain('Ariel no ofrece Reparación de PC.');
    expect(notice.textContent).toContain('lo conservamos tal como está');
    expect(TestBed.inject(Router).url).not.toBe('/solicitud');
    expect(store.draft()).toMatchObject({ description: DESCRIPTION, service: { id: PC.id, slug: 'reparacion-de-pc' }, zone: { id: CENTRO.id } });
    expect(store.recipientIds()).toEqual([]);
    byText(notice as HTMLElement, 'Elegir otro profesional')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="urgent-incompatible"]')).toBeNull();
    expect(store.draft().description).toBe(DESCRIPTION);
  });

  it('cambiar el servicio es una decisión explícita: va al paso Qué con los servicios del profesional y el texto intacto', async () => {
    setup();
    const store = order();
    const { fixture, el } = await openUrgent(pro([GAS, PLOMERIA]));
    byTextIncluding(el, 'Pedir presupuesto urgente')!.click();
    fixture.detectChanges();
    byText(el, 'Cambiar el servicio')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/solicitud');
    expect(store.step()).toBe(REQUEST_STEPS.what);
    expect(store.draft()).toMatchObject({ description: DESCRIPTION, service: { id: PC.id } }); // sigue hasta que la persona elija
    expect(store.targeted()).toBe(true);
    expect(store.offeredServices()?.map((s) => s.slug).sort()).toEqual(['gas', 'plomeria']);
  });

  it('"Crear solicitud" cuando nadie atiende urgencias conserva descripción y servicio', async () => {
    setup();
    const store = order();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UrgentPage);
    fixture.componentRef.setInput('pedido', '1');
    fixture.detectChanges();
    await fixture.whenStable();
    http.match((r) => r.url === `${API}/professionals`).forEach((r) => r.flush({ items: [], total: 0, page: 1, pageSize: 20 }));
    fixture.detectChanges();
    byText(fixture.nativeElement, 'Crear solicitud')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/solicitud');
    expect(store.draft()).toMatchObject({ description: DESCRIPTION, service: { id: PC.id }, urgency: 'TODAY' });
  });
});

describe('borradores de la versión anterior y medición', () => {
  const ATTEMPT = '11111111-1111-4111-8111-111111111111';

  /** Un borrador como lo guardaba la V1 (mismo sobre; el paso nunca se guardó). */
  function storeV1Draft(extra: Record<string, unknown> = {}) {
    sessionStorage.setItem(
      'resuelve.requestDraft',
      JSON.stringify({
        v: 2,
        savedAt: Date.now(),
        draft: {
          id: 'draft-v1',
          description: DESCRIPTION,
          service: { id: PC.id, slug: PC.slug, name: PC.name },
          title: 'La PC no prende',
          urgency: 'TODAY',
          locality: null,
          zone: { id: CENTRO.id, name: CENTRO.name },
          desiredDate: businessDay(),
        },
        recipients: [],
        pendingRequestId: null,
        flowMode: 'DISCOVERY',
        returnToQuote: false,
        journey: { id: ATTEMPT, journey: 'REQUEST', authRequired: false, authReturned: false },
        ...extra,
      }),
    );
  }

  it('se retoma sin perder datos: va a la revisión (por significado) y conserva el intento', () => {
    storeV1Draft();
    setup();
    const store = TestBed.inject(RequestStore);
    expect(store.draft()).toMatchObject({ description: DESCRIPTION, urgency: 'TODAY', service: { slug: 'reparacion-de-pc' }, zone: { id: CENTRO.id } });
    expect(store.step()).toBe(REQUEST_STEPS.review);
    expect(TestBed.inject(RequestJourneyTracker).attemptId()).toBe(ATTEMPT);
  });

  it('sin servicio vuelve al paso Qué (no a un índice viejo)', () => {
    storeV1Draft();
    const raw = JSON.parse(sessionStorage.getItem('resuelve.requestDraft')!);
    raw.draft.service = { id: null, slug: '', name: '' };
    sessionStorage.setItem('resuelve.requestDraft', JSON.stringify(raw));
    setup();
    const store = TestBed.inject(RequestStore);
    expect(store.step()).toBe(REQUEST_STEPS.what);
    expect(store.changingCategory()).toBe(true);
  });

  it('los eventos nuevos del intento retomado llevan la versión 2 y NO un segundo inicio', () => {
    vi.useFakeTimers();
    storeV1Draft();
    const http = setup();
    const store = TestBed.inject(RequestStore);
    store.trackStepViewed(REQUEST_STEPS.review);
    store.trackStepViewed(REQUEST_STEPS.review); // recarga dentro de la misma versión: no suma
    vi.advanceTimersByTime(FLUSH_DELAY_MS + 100);
    const calls = http.match((r) => r.url === `${API}/analytics/request-journey`);
    expect(calls).toHaveLength(1);
    const body = calls[0].request.body as { attemptId: string; flowVersion: number; events: { type: string; step?: number }[] };
    expect(body.attemptId).toBe(ATTEMPT);
    expect(body.flowVersion).toBe(2);
    expect(body.events).toEqual([{ type: 'STEP_VIEWED', step: REQUEST_STEPS.review }]);
    calls[0].flush({ accepted: 1 });
  });
});
