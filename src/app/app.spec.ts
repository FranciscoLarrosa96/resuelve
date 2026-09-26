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
import { ServiceRequest } from './core/models/request';
import { API_URL } from './core/api/api.config';
import { CatalogApiService } from './core/api/catalog-api.service';
import { Category, Service } from './core/models/category';
import { ProfessionalSummary } from './core/models/professional';
import { CATALOG_ERROR, CatalogStore } from './core/state/catalog.store';
import { searchServices } from './core/utils/catalog-search';
import { ServicePicker } from './shared/components/service-picker/service-picker';
import { ServicesPage } from './features/client/services/services-page';
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
  completedJobsCount: 0, services: [], coversEntireCity: false, zones: [],
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
  // El borrador del pedido se persiste en sessionStorage: cada test arranca limpio.
  sessionStorage.clear();
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
    store.addRecipient(pro('e'));
    expect(store.recipientIds()).toEqual(['a', 'b', 'c']);
  });

  it('keeps urgency and date coherent in shared state (backend values)', () => {
    const store = TestBed.inject(RequestStore);
    const today = store.whenFor(0).desiredDate;
    store.updateDraft({ urgency: 'TODAY' });
    expect(store.draft()).toMatchObject({ when: 'Hoy', desiredDate: today });
    store.updateDraft({ when: 'Mañana', desiredDate: store.whenFor(1).desiredDate });
    expect(store.draft().urgency).toBe('FLEXIBLE');
    store.updateDraft({ urgency: 'URGENT' });
    expect(store.draft()).toMatchObject({ when: 'Ahora', desiredDate: today });
  });

  it('resets a new request without clearing the chosen zone', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    store.setZone({ id: 'zone-uncas', name: 'Uncas' });
    store.updateDraft({ urgency: 'TODAY' });
    store.askProfessionals([pro('martin')]);
    search.toggleSelected(pro('martin'));
    search.resetForNewRequest();
    store.resetForNewRequest();
    expect(store.draft().zone).toEqual({ id: 'zone-uncas', name: 'Uncas' });
    expect(store.draft().urgency).toBe('FLEXIBLE');
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

describe('crear solicitud similar', () => {
  const original = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Instalación de split',
    description: 'Tengo un split de 3000 frigorías para instalar.',
    urgency: 'URGENT',
    status: 'COMPLETED',
    desiredDate: '2026-09-02',
    desiredTimeRange: null,
    service: { id: 'uuid-electricidad', name: 'Electricidad', slug: 'electricidad' },
    zone: { id: 'zone-centro', name: 'Centro', slug: 'centro' },
    photos: [],
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-06T10:00:00Z',
    exactAddress: 'Alem 455',
    selectedProfessionalId: 'p1',
    acceptedQuoteId: 'q1',
    completedAt: null,
    completedBy: null,
    cancelledAt: null,
    appointment: null, completionDue: false, review: null, canReview: false,
    invitations: [],
  } as ServiceRequest;

  it('crea un borrador nuevo sin reutilizar la solicitud anterior', () => {
    const store = TestBed.inject(RequestStore);
    const search = TestBed.inject(SearchStore);
    const before = JSON.stringify(original);

    store.askProfessionals([pro('carlos')]);
    search.toggleSelected(pro('carlos'));
    search.resetForNewRequest();
    store.repeatFrom(original);
    const draft = store.draft();

    expect(draft.id).not.toBe(original.id);
    expect(draft.sourceRequestId).toBe(original.id);
    expect(JSON.stringify(original)).toBe(before);
    expect(draft).toMatchObject({
      title: original.title,
      description: original.description,
      service: { id: 'uuid-electricidad', slug: 'electricidad' },
      zone: { id: 'zone-centro', name: 'Centro' },
    });
    // Todo lo demás arranca de cero (urgencia, fecha, profesionales, dirección).
    expect(draft.urgency).toBe('FLEXIBLE');
    expect(store.exactAddress()).toBe('');
    expect(store.recipientIds()).toEqual([]);
    expect(store.pendingRequestId()).toBeNull();
    expect(draft).not.toHaveProperty('status');
    expect(store.step()).toBe(4); // "Revisá tu pedido"
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
    store.goToStep(4);
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
    store.setZone({ id: 'zone-centro', name: 'Centro' });
    store.updateDescription('Hay que podar el ligustro del fondo', false);
    store.askProfessionals([pro('uuid-oscar')]);
    // El payload lleva los ids reales, nunca el nombre como autoridad.
    expect(store.buildPayload()).toMatchObject({ serviceId: 'uuid-jardineria', zoneId: 'zone-centro' });
    expect(store.buildPayload()).not.toHaveProperty('service');
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
