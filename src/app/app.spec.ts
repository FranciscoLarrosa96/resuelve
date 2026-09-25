import { PLATFORM_ID, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { interpretRequest } from './core/utils/interpret-request';
import { RequestStore } from './core/state/request.store';
import { SearchStore } from './core/state/search.store';
import { ClientRequestsStore } from './core/state/client-requests.store';
import { ProStore } from './core/state/pro.store';
import { API_URL } from './core/api/api.config';
import { CatalogApiService } from './core/api/catalog-api.service';
import { Category, Service } from './core/models/category';
import { ProfessionalSummary } from './core/models/professional';
import { CATALOG_ERROR, CatalogStore } from './core/state/catalog.store';
import { searchServices } from './core/utils/catalog-search';
import { ServicePicker } from './shared/components/service-picker/service-picker';
import { ServicesPage } from './features/client/services/services-page';
import { proRequestActions } from './features/pro/pro-ui';
import { ProRequestsPage } from './features/pro/requests/pro-requests-page';
import { ProRequestDetailPage } from './features/pro/request-detail/pro-request-detail-page';
import { HomePage } from './features/client/home/home-page';

// ---- Catálogo de prueba (HTTP mockeado: los tests nunca llaman a Render) ----
const API = 'http://api.test/api/v1';
const svc = (slug: string, name: string, categoryId: string, requiresLicense = false): Service => ({
  id: `uuid-${slug}`, name, slug, categoryId, requiresLicense,
});
const TEST_SERVICES: Service[] = [
  svc('electricidad', 'Electricidad', 'cat-hogar', true),
  svc('gas', 'Gas', 'cat-hogar', true),
  svc('plomeria', 'Plomería', 'cat-hogar'),
  svc('cerrajeria', 'Cerrajería', 'cat-hogar'),
  svc('pintura', 'Pintura', 'cat-hogar'),
  svc('corte-de-pasto', 'Corte de pasto', 'cat-exterior'),
  svc('jardineria', 'Jardinería', 'cat-exterior'),
  svc('fletes', 'Fletes', 'cat-transporte'),
  svc('mudanzas', 'Mudanzas', 'cat-transporte'),
  svc('redes', 'Redes', 'cat-tecnologia'),
];
const cat = (id: string, name: string, slug: string): Category => ({
  id, name, slug, services: TEST_SERVICES.filter((s) => s.categoryId === id),
});
const TEST_CATEGORIES: Category[] = [
  cat('cat-hogar', 'Hogar y reparaciones', 'hogar-y-reparaciones'),
  cat('cat-exterior', 'Exterior', 'exterior'),
  cat('cat-transporte', 'Transporte', 'transporte'),
  cat('cat-tecnologia', 'Tecnología', 'tecnologia'),
];
const byslug = (slug: string) => TEST_SERVICES.find((s) => s.slug === slug)!;

/** Profesional con la forma exacta de GET /professionals (datos de prueba). */
const pro = (id: string, overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id, firstName: id, lastName: 'Prueba', displayName: `${id} Prueba`, avatarUrl: null, headline: null, bio: null,
  yearsExperience: 3, availableToday: false, averageResponseMinutes: null, averageRating: null, reviewsCount: 0,
  completedJobsCount: 0, services: [], zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  ...overrides,
});

function http() {
  return TestBed.inject(HttpTestingController);
}

/** Responde las dos llamadas del catálogo. */
function flushCatalog(categories = TEST_CATEGORIES, services = TEST_SERVICES): void {
  http().expectOne({ method: 'GET', url: `${API}/categories` }).flush(categories);
  http().expectOne({ method: 'GET', url: `${API}/services` }).flush(services);
}

/** El Home pide profesionales reales: se responden vacíos (tests de catálogo). */
function flushProfessionals(): void {
  for (const req of http().match((r) => r.url === `${API}/professionals`)) {
    req.flush({ items: [], page: 1, pageSize: 20, total: 0 });
  }
}

function loadTestCatalog(): CatalogStore {
  const catalog = TestBed.inject(CatalogStore);
  catalog.loadCatalog();
  flushCatalog();
  return catalog;
}

async function render<T>(component: Type<T>) {
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return fixture;
}

async function refresh(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  fixture.detectChanges();
  await fixture.whenStable();
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
  });
});

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('interpretRequest', () => {
  it('classifies common problems', () => {
    expect(interpretRequest('Saltan las térmicas con el horno').serviceSlug).toBe('electricidad');
    expect(interpretRequest('Me quedé afuera de casa').serviceSlug).toBe('cerrajeria');
    expect(interpretRequest('Hay que destapar la cloaca').serviceSlug).toBe('plomeria');
    expect(interpretRequest('El termotanque pierde agua').problem).toBe('Termotanque con pérdida');
  });
});

describe('RequestStore', () => {
  it('keeps the request created from the home text', () => {
    const store = TestBed.inject(RequestStore);
    store.setHomeText('Necesito un gasista matriculado');
    store.startFromHome();
    expect(store.draft().service.slug).toBe('gas');
    expect(store.draft().description).toBe('Necesito un gasista matriculado');
  });

  it('limits recipients to three', () => {
    const store = TestBed.inject(RequestStore);
    store.askProfessionals([pro('a'), pro('b'), pro('c'), pro('d')]);
    expect(store.recipientIds()).toEqual(['a', 'b', 'c']);
  });

  it('keeps urgency and date coherent in shared state', () => {
    const store = TestBed.inject(RequestStore);
    store.updateDraft({ urgency: 'today' });
    expect(store.draft().when).toBe('Hoy');
    store.updateDraft({ when: 'Mañana' });
    expect(store.draft().urgency).toBe('wait');
    store.updateDraft({ urgency: 'urgent' });
    expect(store.draft().when).toBe('Ahora');
  });

  it('resets a new request without clearing the general location', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    store.updateDraft({ zone: 'Uncas', urgency: 'today', photos: 3 });
    store.askProfessionals([pro('martin')]);
    store.addHomePhoto();
    search.toggleSelected(pro('martin'));
    search.resetForNewRequest();
    store.resetForNewRequest();
    expect(store.draft().zone).toBe('Uncas');
    expect(store.draft().photos).toBe(0);
    expect(store.homePhotos()).toBe(0);
    expect(store.draft().urgency).toBe('wait');
    expect(store.recipientIds()).toEqual([]);
    expect(search.selectedIds()).toEqual([]);
  });
});

describe('SearchStore', () => {
  it('compares two or three professionals, never four', () => {
    const search = TestBed.inject(SearchStore);
    search.clearSelection();
    search.toggleSelected(pro('martin'));
    search.openCompare();
    expect(search.compareOpen()).toBe(false);
    search.toggleSelected(pro('luciano'));
    search.openCompare();
    expect(search.compareOpen()).toBe(true);
    search.toggleSelected(pro('marcelo'));
    search.toggleSelected(pro('walter'));
    expect(search.selectedIds()).toEqual(['martin', 'luciano', 'marcelo']);
  });
});

describe('request transitions', () => {
  it('requires a chosen professional before scheduling and completion before review', () => {
    const store = TestBed.inject(ClientRequestsStore);
    store.confirmDate('c1');
    store.markDone('c1');
    store.rating.set(5);
    store.submitReview('c1');
    expect(store.requests().find((r) => r.id === 'c1')?.stage).toBe(0);
    // c2 solo tiene presupuesto de Carlos: elegir a alguien sin presupuesto no avanza.
    store.chooseQuote('c2', 'juan');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(1);
    store.chooseQuote('c2', 'carlos');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(2);
    store.confirmDate('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(3);
    store.markDone('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(4);
    store.submitReview('c2');
    expect(store.requests().find((r) => r.id === 'c2')?.stage).toBe(5);
  });

  it('does not send a second quote to the same professional request', () => {
    const store = TestBed.inject(ProStore);
    const client = TestBed.inject(ClientRequestsStore);
    store.sendQuote('r1');
    const amount = store.byId('r1')?.quoteAmount;
    expect(client.requests().find((r) => r.id === 'c2')?.quotes?.some((q) => q.professionalId === 'juan')).toBe(true);
    store.updateQuote({ labor: 999999 });
    store.sendQuote('r1');
    expect(store.byId('r1')?.quoteAmount).toBe(amount);
  });
});

describe('crear solicitud similar', () => {
  it('crea un borrador nuevo sin reutilizar la solicitud anterior', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    const client = TestBed.inject(ClientRequestsStore);
    const original = client.requests().find((r) => r.id === 'c6')!; // cerrada, con profesional y reseña
    const before = JSON.stringify(original);

    store.askProfessionals([pro('carlos')]);
    search.toggleSelected(pro('carlos'));
    store.updateDraft({ urgency: 'urgent', photos: 3 });
    search.resetForNewRequest();
    store.repeatFrom(original);
    const draft = store.draft();

    // Nuevo id; la solicitud original queda intacta.
    expect(draft.id).not.toBe(original.id);
    expect(draft.sourceRequestId).toBe(original.id);
    expect(JSON.stringify(client.requests().find((r) => r.id === 'c6'))).toBe(before);

    // Copia solo lo básico.
    expect(draft).toMatchObject({
      title: original.title,
      description: original.description,
      service: original.service,
      zone: original.zone,
    });

    // Todo lo demás arranca de cero.
    expect(draft.urgency).toBe('wait');
    expect(draft.when).toBe('Hoy');
    expect(draft.photos).toBe(0);
    expect(store.recipientIds()).toEqual([]);
    expect(search.selectedIds()).toEqual([]);
    expect(draft).not.toHaveProperty('chosenId');
    expect(draft).not.toHaveProperty('quotes');
    expect(draft).not.toHaveProperty('stage');

    // Lleva a "Revisá tu pedido" antes de enviar.
    expect(store.step()).toBe(5);
  });

  it('al enviarla genera una solicitud nueva, sin presupuestos ni profesional', async () => {
    const store = TestBed.inject(RequestStore);
    const client = TestBed.inject(ClientRequestsStore);
    const original = client.requests().find((r) => r.id === 'c6')!;
    store.repeatFrom(original);
    store.askProfessionals([pro('pablo')]);
    expect(await store.send()).toBe(true);
    const created = client.requests()[0];
    expect(created.professionals.map((p) => p.id)).toEqual(['pablo']);
    expect(created.id).not.toBe(original.id);
    expect(created.stage).toBe(0);
    expect(created.quotes).toBeUndefined();
    expect(created.chosenId).toBeUndefined();
    expect(created.myRating).toBeUndefined();
    expect(client.requests().filter((r) => r.id === 'c6')).toHaveLength(1);
  });

  it('cada borrador nuevo tiene un id distinto', () => {
    const store = TestBed.inject(RequestStore);
    const first = store.draft().id;
    store.resetForNewRequest();
    const second = store.draft().id;
    store.resetForNewRequest();
    expect(new Set([first, second, store.draft().id]).size).toBe(3);
  });
});

describe('título y descripción del pedido', () => {
  it('la descripción y el título se pueden editar', () => {
    const store = TestBed.inject(RequestStore);
    store.setHomeText('Me pierde agua abajo de la pileta');
    store.startFromHome();
    store.updateDescription('Pierde agua abajo de la pileta y se moja el mueble');
    store.updateTitle('Pérdida en la cocina');
    expect(store.draft().description).toBe('Pierde agua abajo de la pileta y se moja el mueble');
    expect(store.draft().title).toBe('Pérdida en la cocina');
    expect(store.draft().service.slug).toBe('plomeria');
    store.updateTitle('   ');
    expect(store.draft().title).toBe('Pérdida en la cocina');
  });

  it('elegir un servicio directamente no arrastra la descripción de ejemplo', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(byslug('electricidad'));
    expect(store.draft().description).toBe('');
    expect(store.draft().title).toBe('Problema eléctrico');
  });

  it('cambiar la descripción no deja un servicio viejo incoherente', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(byslug('electricidad'));
    store.goToStep(5);
    const changed = store.updateDescription('Tengo una pérdida abajo de la pileta');
    expect(changed).toBe(true);
    expect(store.draft().service.slug).toBe('plomeria');
    expect(store.draft().title).toBe('Pérdida bajo mesada');
    expect(store.step()).toBe(0); // vuelve a confirmar el servicio
  });

  it('un texto que no se reconoce no cambia el servicio elegido', () => {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(byslug('electricidad'));
    expect(store.updateDescription('Necesito que venga el jueves')).toBe(false);
    expect(store.draft().service.slug).toBe('electricidad');
  });
});

describe('acciones del profesional', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  const texts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('a, button')).map((n) => (n.textContent ?? '').trim());

  it('una solicitud estándar ofrece presupuesto, nunca Aceptar ni Tomar trabajo', () => {
    for (const urgency of ['Para hoy', 'Puede esperar'] as const) {
      const actions = proRequestActions({ status: 'new', urgency })!;
      expect(actions.primary).toEqual({ kind: 'quote', label: 'Enviar presupuesto' });
      expect(actions.secondary.label).toBe('No disponible');
    }
  });

  it('una urgencia real permite Tomar trabajo', () => {
    expect(proRequestActions({ status: 'new', urgency: 'Urgente' })!.primary).toEqual({ kind: 'take', label: 'Tomar trabajo' });
    expect(proRequestActions({ status: 'quoted', urgency: 'Urgente' })).toBeNull();
  });

  it('la vista previa de /pro/solicitudes no muestra Aceptar en una solicitud "Para hoy"', async () => {
    const fixture = TestBed.createComponent(ProRequestsPage);
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels).toContain('Enviar presupuesto');
    expect(labels).toContain('No disponible');
    expect(labels.some((t) => /^Aceptar|Tomar trabajo/.test(t))).toBe(false);
  });

  it('el detalle (desktop y mobile) de una urgencia ofrece Tomar trabajo y no Aceptar', async () => {
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', 'r2'); // "Urgente"
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels.filter((t) => t === 'Tomar trabajo')).toHaveLength(2);
    expect(labels.filter((t) => t === 'No disponible')).toHaveLength(2);
    expect(labels.some((t) => /^Aceptar/.test(t))).toBe(false);
  });

  it('el detalle de una solicitud estándar no ofrece Tomar trabajo', async () => {
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', 'r1'); // "Para hoy"
    await fixture.whenStable();
    const labels = texts(fixture.nativeElement);
    expect(labels).not.toContain('Tomar trabajo');
    expect(labels.filter((t) => t === 'Enviar presupuesto')).toHaveLength(2);
  });
});

describe('home', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it('"Ver todos los profesionales" lleva a resultados de profesionales', async () => {
    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    const link = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find((a) =>
      (a.textContent ?? '').includes('Ver todos los profesionales'),
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/profesionales');
    expect(fixture.nativeElement.textContent).not.toContain('Ver todos los servicios');
  });
});

describe('catálogo real (API)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));
  afterEach(() => http().verify());

  const text = (el: HTMLElement) => el.textContent ?? '';
  const buttons = (el: HTMLElement) =>
    Array.from<HTMLButtonElement>(el.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

  it('carga categorías y servicios desde /api/v1', () => {
    const catalog = loadTestCatalog();
    expect(catalog.loaded()).toBe(true);
    expect(catalog.categories().map((c) => c.slug)).toEqual(TEST_CATEGORIES.map((c) => c.slug));
    expect(catalog.services()).toHaveLength(TEST_SERVICES.length);
    expect(catalog.serviceBySlug('gas')).toEqual(byslug('gas'));
    expect(catalog.categoryBySlug('transporte')?.name).toBe('Transporte');
  });

  it('getServices acepta filtrar por categoría', () => {
    let result: Service[] = [];
    TestBed.inject(CatalogApiService).getServices({ category: 'exterior' }).subscribe((s) => (result = s));
    http().expectOne(`${API}/services?category=exterior`).flush([byslug('jardineria')]);
    expect(result).toEqual([byslug('jardineria')]);
  });

  it('no duplica requests: una carga por sesión', async () => {
    const catalog = TestBed.inject(CatalogStore);
    catalog.loadCatalog();
    catalog.loadCatalog();
    await render(ServicesPage); // también pide cargar
    flushCatalog(); // expectOne: exactamente una llamada a cada endpoint
    catalog.loadCatalog();
    await render(HomePage);
    http().expectNone(`${API}/categories`);
    http().expectNone(`${API}/services`);
    flushProfessionals();
  });

  it('agrupa por categoría respetando el orden de la API', () => {
    const catalog = TestBed.inject(CatalogStore);
    catalog.loadCatalog();
    // Un servicio de una categoría que no vino en /categories no se muestra.
    flushCatalog(TEST_CATEGORIES, [...TEST_SERVICES, svc('huerfano', 'Huérfano', 'cat-inactiva')]);
    const groups = catalog.servicesByCategory();
    expect(groups.map((g) => g.category.name)).toEqual(['Hogar y reparaciones', 'Exterior', 'Transporte', 'Tecnología']);
    expect(groups[2].services.map((s) => s.slug)).toEqual(['fletes', 'mudanzas']);
    expect(catalog.serviceBySlug('huerfano')).toBeUndefined();
    expect(catalog.activeServices()).toHaveLength(TEST_SERVICES.length);
  });

  it('busca sobre los datos reales (sin tildes, por categoría)', async () => {
    const catalog = loadTestCatalog();
    const find = (q: string) => searchServices(catalog.activeServices(), catalog.categories(), q).map((s) => s.slug);
    expect(find('plomeria')).toEqual(['plomeria']);
    expect(find('pasto')).toEqual(['corte-de-pasto']);
    expect(find('transporte')).toEqual(['fletes', 'mudanzas']);
    expect(find('destapaciones')).toEqual([]);

    const fixture = await render(ServicesPage);
    const input = fixture.nativeElement.querySelector('#service-catalog-search') as HTMLInputElement;
    input.value = 'jardin';
    input.dispatchEvent(new Event('input'));
    await refresh(fixture);
    expect(buttons(fixture.nativeElement)).toEqual(['Jardinería →']);
    expect(text(fixture.nativeElement)).toContain('Exterior');
    expect(text(fixture.nativeElement)).not.toContain('Hogar y reparaciones');
  });

  it('mientras carga muestra el esqueleto, no "no hay servicios"', async () => {
    const catalog = TestBed.inject(CatalogStore);
    const fixture = await render(ServicesPage);
    expect(catalog.loading()).toBe(true);
    expect(catalog.pending()).toBe(true);
    expect(catalog.empty()).toBe(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="catalog-skeleton"]')).toBeTruthy();
    expect(text(el)).toContain('Cargando servicios');
    expect(text(el)).not.toMatch(/No encontramos|Todavía no hay servicios/);

    flushCatalog([], []);
    await refresh(fixture);
    expect(catalog.empty()).toBe(true);
    expect(el.querySelector('[data-testid="catalog-skeleton"]')).toBeNull();
    expect(text(el)).toContain('Todavía no hay servicios disponibles.');
  });

  it('si falla muestra el error y "Reintentar" vuelve a pedir', async () => {
    const catalog = TestBed.inject(CatalogStore);
    const fixture = await render(ServicesPage);
    http().expectOne(`${API}/categories`).flush({ message: 'boom' }, { status: 503, statusText: 'Unavailable' });
    expect(http().match(`${API}/services`).every((r) => r.cancelled)).toBe(true); // forkJoin cancela la otra
    await refresh(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(catalog.error()).toBe(CATALOG_ERROR);
    expect(text(el)).toContain('No pudimos cargar los servicios');

    const retry = Array.from<HTMLButtonElement>(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'))!;
    retry.click();
    await refresh(fixture);
    expect(catalog.loading()).toBe(true);
    flushCatalog();
    await refresh(fixture);
    expect(catalog.error()).toBeNull();
    expect(buttons(el)).toContain('Electricidad →');
  });

  it('no vuelve en silencio a datos mock cuando la API falla', async () => {
    const catalog = TestBed.inject(CatalogStore);
    const fixture = await render(HomePage);
    http().expectOne(`${API}/categories`).error(new ProgressEvent('network error'));
    expect(http().match(`${API}/services`).every((r) => r.cancelled)).toBe(true); // forkJoin cancela la otra
    await refresh(fixture);
    expect(catalog.services()).toEqual([]);
    expect(catalog.activeServices()).toEqual([]);
    const labels = buttons(fixture.nativeElement);
    for (const name of ['Electricidad', 'Plomería', 'Gas', 'Destapaciones']) {
      expect(labels.some((l) => l.startsWith(name))).toBe(false);
    }
    expect(text(fixture.nativeElement)).toContain('No pudimos cargar los servicios');
    expect(labels).toContain('Reintentar');
    flushProfessionals();
  });

  it('en el servidor (prerender) no hace requests', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const catalog = TestBed.inject(CatalogStore);
    catalog.loadCatalog();
    http().expectNone(`${API}/categories`);
    expect(catalog.pending()).toBe(true);
  });

  it('el selector de servicios usa el catálogo de la API', async () => {
    loadTestCatalog();
    const fixture = TestBed.createComponent(ServicePicker);
    fixture.componentRef.setInput('fieldId', 'test-picker');
    fixture.componentRef.setInput('selected', 'plomeria');
    const chosen: Service[] = [];
    fixture.componentInstance.chosen.subscribe((s) => chosen.push(s));
    await refresh(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain('Plomería'); // nombre del seleccionado, desde la API
    const input = el.querySelector('input')!;
    input.value = 'redes'; // servicio que solo existe en el backend
    input.dispatchEvent(new Event('input'));
    await refresh(fixture);
    const option = Array.from<HTMLButtonElement>(el.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Redes'))!;
    expect(option.textContent).toContain('Tecnología');
    option.click();
    expect(chosen).toEqual([byslug('redes')]);
  });

  it('RequestStore guarda el serviceId real', async () => {
    const store = TestBed.inject(RequestStore);
    const client = TestBed.inject(ClientRequestsStore);
    // El texto se interpreta antes de que llegue el catálogo: queda el slug…
    store.setHomeText('Necesito un gasista matriculado');
    store.startFromHome();
    expect(store.draft().service).toEqual({ id: null, slug: 'gas', name: '' });
    TestBed.inject(CatalogStore).loadCatalog();
    // …y al cargar se completa con el id y el nombre reales.
    flushCatalog();
    TestBed.tick();
    expect(store.draft().service).toEqual({ id: 'uuid-gas', slug: 'gas', name: 'Gas' });
    expect(store.serviceName()).toBe('Gas');

    store.setService(byslug('jardineria'));
    expect(store.draft().service.id).toBe('uuid-jardineria');
    store.askProfessionals([pro('uuid-oscar')]);
    expect(await store.send()).toBe(true);
    expect(client.requests()[0].service).toEqual({ id: 'uuid-jardineria', slug: 'jardineria', name: 'Jardinería' });
  });

  it('el filtro de matrícula solo aplica a servicios que la requieren (API)', () => {
    loadTestCatalog();
    const request = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    request.setService(byslug('electricidad'));
    expect(search.licenseApplicable()).toBe(true); // requiresLicense viene de la API
    request.setService(byslug('pintura'));
    expect(search.licenseApplicable()).toBe(false);
  });

  it('el Home muestra los servicios destacados con datos de la API', async () => {
    const fixture = await render(HomePage);
    expect(fixture.nativeElement.querySelector('[data-testid="catalog-skeleton"]')).toBeTruthy();
    // La API devuelve otro nombre para Gas y no tiene aire acondicionado ni albañilería.
    const services = TEST_SERVICES.map((s) => (s.slug === 'gas' ? { ...s, name: 'Gas natural' } : s));
    flushCatalog(TEST_CATEGORIES, services);
    flushProfessionals(); // el Home también pide profesionales reales (ver professionals.spec.ts)
    await refresh(fixture);
    const labels = buttons(fixture.nativeElement);
    const tiles = ['Electricidad', 'Gas natural', 'Plomería', 'Cerrajería', 'Pintura'];
    for (const name of tiles) expect(labels.some((l) => l.startsWith(name))).toBe(true);
    for (const name of ['Aire acondicionado', 'Albañilería', 'Redes']) expect(labels.some((l) => l.startsWith(name))).toBe(false);
    expect(text(fixture.nativeElement)).toContain('10 servicios en 4 categorías');

    const request = TestBed.inject(RequestStore);
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
      .find((b) => b.textContent?.trim().startsWith('Gas natural'))!
      .click();
    expect(request.draft().service).toEqual({ id: 'uuid-gas', slug: 'gas', name: 'Gas natural' });
  });
});
