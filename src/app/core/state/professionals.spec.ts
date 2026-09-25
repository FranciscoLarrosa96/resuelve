import { PLATFORM_ID, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { API_URL } from '../api/api.config';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { Category, Service, Zone } from '../models/category';
import { ProfessionalDetail, ProfessionalSummary } from '../models/professional';
import { ProfessionalProfilePage } from '../../features/client/professional-profile/professional-profile-page';
import { ResultsPage } from '../../features/client/results/results-page';
import { CatalogStore } from './catalog.store';
import { PROFESSIONALS_ERROR, ProfessionalsStore } from './professionals.store';
import { RequestStore } from './request.store';
import { SearchStore } from './search.store';

// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';

const svc = (slug: string, name: string, requiresLicense = false): Service => ({
  id: `uuid-${slug}`, name, slug, categoryId: 'cat-hogar', requiresLicense,
});
const SERVICES = [svc('electricidad', 'Electricidad', true), svc('plomeria', 'Plomería'), svc('pintura', 'Pintura')];
const CATEGORIES: Category[] = [{ id: 'cat-hogar', name: 'Hogar', slug: 'hogar', services: SERVICES }];
const ZONES: Zone[] = [
  { id: 'uuid-centro', name: 'Centro', slug: 'centro', cityId: 'c' },
  { id: 'uuid-uncas', name: 'Uncas', slug: 'uncas', cityId: 'c' },
];

const pro = (id: string, overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id, firstName: 'Ana', lastName: id, displayName: `Ana ${id}`, avatarUrl: null, headline: 'Perfil de prueba',
  bio: null, yearsExperience: 4, availableToday: false, averageResponseMinutes: null, averageRating: null,
  reviewsCount: 0, completedJobsCount: 0,
  services: [{ id: 'uuid-plomeria', name: 'Plomería', slug: 'plomeria' }],
  zones: [{ id: 'uuid-centro', name: 'Centro', slug: 'centro' }],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  ...overrides,
});
const page = (items: ProfessionalSummary[], total = items.length, n = 1) => ({ items, page: n, pageSize: 20, total });
const detail = (id: string, overrides: Partial<ProfessionalDetail> = {}): ProfessionalDetail => ({
  ...pro(id),
  portfolio: [],
  ratingDistribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
  reviews: [],
  ...overrides,
});

function setup(server = false) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter(routes),
      { provide: API_URL, useValue: API },
      ...(server ? [{ provide: PLATFORM_ID, useValue: 'server' }] : []),
    ],
  });
  return { http: TestBed.inject(HttpTestingController), store: TestBed.inject(ProfessionalsStore) };
}

function loadCatalog(http: HttpTestingController) {
  TestBed.inject(CatalogStore).loadCatalog();
  http.expectOne(`${API}/categories`).flush(CATEGORIES);
  http.expectOne(`${API}/services`).flush(SERVICES);
}

const isList = (url: string) => url === `${API}/professionals`;

async function render<T>(type: Type<T>) {
  const fixture = TestBed.createComponent(type);
  await fixture.whenStable();
  return fixture;
}

async function refresh(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('ProfessionalsApiService', () => {
  it('listado: GET /professionals con los query params reales (y sin los vacíos)', () => {
    const { http } = setup();
    const api = TestBed.inject(ProfessionalsApiService);
    api.getProfessionals({ service: 'uuid-gas', zone: 'uuid-centro', availableToday: true, licenseVerified: false, minRating: 4.5, page: 2, pageSize: 20 }).subscribe();
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual(['availableToday', 'minRating', 'page', 'pageSize', 'service', 'zone']);
    expect(req.request.params.get('service')).toBe('uuid-gas');
    expect(req.request.params.get('availableToday')).toBe('true');
    req.flush(page([]));
  });

  it('detalle: GET /professionals/:id', () => {
    const { http } = setup();
    let result: ProfessionalDetail | undefined;
    TestBed.inject(ProfessionalsApiService).getProfessionalById('uuid-1').subscribe((d) => (result = d));
    http.expectOne(`${API}/professionals/uuid-1`).flush(detail('uuid-1'));
    expect(result?.id).toBe('uuid-1');
  });
});

describe('ProfessionalsStore', () => {
  it('loading → success, sin requests duplicadas para los mismos filtros', () => {
    const { http, store } = setup();
    store.setFilters({ serviceId: 'uuid-plomeria' });
    store.load();
    store.load();
    expect(store.pending()).toBe(true);
    const reqs = http.match((r) => isList(r.url));
    expect(reqs).toHaveLength(1);
    expect(reqs[0].request.params.get('service')).toBe('uuid-plomeria');
    reqs[0].flush(page([pro('uuid-1'), pro('uuid-2')], 2));
    expect(store.pending()).toBe(false);
    expect(store.items().map((p) => p.id)).toEqual(['uuid-1', 'uuid-2']);
    expect(store.resultCount()).toBe(2);
    expect(store.hasResults()).toBe(true);
    store.load();
    http.expectNone((r) => isList(r.url));
  });

  it('cero profesionales es un vacío real (no error, no mocks)', () => {
    const { http, store } = setup();
    store.setFilters({ serviceId: 'uuid-pintura' });
    http.expectOne((r) => isList(r.url)).flush(page([]));
    expect(store.empty()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.items()).toEqual([]);
  });

  it('error recuperable: muestra el error y "retry" vuelve a pedir', () => {
    const { http, store } = setup();
    store.setFilters({ serviceId: 'uuid-plomeria' });
    http.expectOne((r) => isList(r.url)).flush(null, { status: 503, statusText: 'Unavailable' });
    expect(store.error()).toBe(PROFESSIONALS_ERROR);
    expect(store.items()).toEqual([]);
    expect(store.pending()).toBe(false);
    store.retry();
    expect(store.error()).toBeNull();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    expect(store.items()).toHaveLength(1);
  });

  it('cambiar filtros pide de nuevo al backend (zona y disponibilidad reales)', () => {
    const { http, store } = setup();
    store.setFilters({ serviceId: 'uuid-plomeria' });
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    store.setFilters({ zoneId: 'uuid-uncas', availableToday: true });
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.params.get('zone')).toBe('uuid-uncas');
    expect(req.request.params.get('availableToday')).toBe('true');
    expect(store.activeFilters()).toBe(2);
    req.flush(page([]));
    store.clearFilters();
    const cleared = http.expectOne((r) => isList(r.url));
    expect(cleared.request.params.has('zone')).toBe(false);
    expect(cleared.request.params.get('service')).toBe('uuid-plomeria');
    cleared.flush(page([]));
  });

  it('el filtro de matrícula solo se manda si el servicio la requiere', () => {
    const { http, store } = setup();
    loadCatalog(http);
    store.setFilters({ serviceId: 'uuid-pintura', licenseVerified: true });
    expect(http.expectOne((r) => isList(r.url)).request.params.has('licenseVerified')).toBe(false);
    store.setFilters({ serviceId: 'uuid-electricidad', licenseVerified: true });
    expect(http.expectOne((r) => isList(r.url)).request.params.get('licenseVerified')).toBe('true');
  });

  it('respeta la paginación del backend ("Ver más" pide la página siguiente)', () => {
    const { http, store } = setup();
    store.setFilters({ serviceId: 'uuid-plomeria' });
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')], 2));
    expect(store.hasMore()).toBe(true);
    store.loadMore();
    const next = http.expectOne((r) => isList(r.url));
    expect(next.request.params.get('page')).toBe('2');
    next.flush(page([pro('uuid-2')], 2, 2));
    expect(store.items().map((p) => p.id)).toEqual(['uuid-1', 'uuid-2']);
    expect(store.hasMore()).toBe(false);
  });

  it('perfil: carga una vez, 404 → "not-found", 5xx → "error"', () => {
    const { http, store } = setup();
    store.loadDetail('uuid-1');
    store.loadDetail('uuid-1');
    http.expectOne(`${API}/professionals/uuid-1`).flush(detail('uuid-1'));
    expect(store.selected()?.id).toBe('uuid-1');
    store.loadDetail('uuid-1');
    http.expectNone(`${API}/professionals/uuid-1`);

    store.loadDetail('uuid-x');
    http.expectOne(`${API}/professionals/uuid-x`).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    expect(store.detailError()).toBe('not-found');
    store.loadDetail('uuid-y');
    http.expectOne(`${API}/professionals/uuid-y`).flush(null, { status: 500, statusText: 'Error' });
    expect(store.detailError()).toBe('error');
  });

  it('en el servidor (prerender) no pide nada', () => {
    const { http, store } = setup(true);
    store.setFilters({ serviceId: 'uuid-plomeria' });
    store.loadDetail('uuid-1');
    http.verify();
  });
});

describe('listado /profesionales', () => {
  async function openResults() {
    const { http, store } = setup();
    loadCatalog(http);
    TestBed.inject(RequestStore).setService(SERVICES[1]); // Plomería
    const fixture = await render(ResultsPage);
    http.expectOne(`${API}/zones?city=tandil`).flush(ZONES);
    return { http, store, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('pide por serviceId real, muestra esqueleto y después los profesionales del API', async () => {
    const { http, fixture, el } = await openResults();
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.params.get('service')).toBe('uuid-plomeria');
    await refresh(fixture);
    expect(el.querySelector('[data-testid="pros-skeleton"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Todavía no hay profesionales');
    req.flush(page([pro('uuid-1', { averageRating: 4.8, reviewsCount: 12, availableToday: true })]));
    await refresh(fixture);
    expect(el.textContent).toContain('Ana uuid-1');
    expect(el.textContent).toContain('4,8');
    expect(el.textContent).toContain('Disponible hoy');
    expect(el.textContent).toContain('1 profesional para Plomería');
    // Nada de datos inventados.
    for (const fake of ['km', 'Responde', 'Recomendados', 'Carlos', 'Más cerca']) expect(el.textContent).not.toContain(fake);
  });

  it('sin reseñas muestra "Sin reseñas todavía" (rating null, no 0)', async () => {
    const { http, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    await refresh(fixture);
    expect(el.textContent).toContain('Sin reseñas todavía');
    expect(el.textContent).not.toContain('★ 0');
  });

  it('zona y disponibilidad filtran en el backend', async () => {
    const { http, store, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    await refresh(fixture);
    const select = el.querySelector<HTMLSelectElement>('#results-zone-desktop')!;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Todas las zonas', 'Centro', 'Uncas']);
    select.value = 'uuid-uncas';
    select.dispatchEvent(new Event('change'));
    expect(http.expectOne((r) => isList(r.url)).request.params.get('zone')).toBe('uuid-uncas');
    store.setFilters({ availableToday: true });
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.params.get('availableToday')).toBe('true');
    req.flush(page([]));
    await refresh(fixture);
    expect(el.textContent).toContain('No encontramos profesionales con esos filtros');
  });

  it('cero profesionales: estado vacío real con salida a servicios', async () => {
    const { http, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([]));
    await refresh(fixture);
    expect(el.textContent).toContain('Todavía no hay profesionales disponibles para este servicio.');
    expect(el.querySelector('a[href="/servicios"]')).toBeTruthy();
  });

  it('error: "Reintentar" vuelve a pedir', async () => {
    const { http, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(null, { status: 0, statusText: 'Unknown' });
    await refresh(fixture);
    expect(el.textContent).toContain(PROFESSIONALS_ERROR);
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'))!.click();
    http.expectOne((r) => isList(r.url)).flush(page([]));
  });
});

describe('perfil público /profesional/:id', () => {
  async function openProfile(response: ProfessionalDetail | { status: number }) {
    const { http } = setup();
    loadCatalog(http);
    const fixture = TestBed.createComponent(ProfessionalProfilePage);
    fixture.componentRef.setInput('id', 'uuid-1');
    await fixture.whenStable();
    const req = http.expectOne(`${API}/professionals/uuid-1`);
    if ('status' in response) req.flush({ code: 'NOT_FOUND' }, { status: response.status, statusText: 'x' });
    else req.flush(response);
    await refresh(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra datos reales, sin reseñas ni portfolio inventados y sin datos privados', async () => {
    const el = await openProfile(
      detail('uuid-1', {
        bio: 'Bio real del profesional.',
        services: [
          { id: 'uuid-plomeria', name: 'Plomería', slug: 'plomeria' },
          { id: 'uuid-electricidad', name: 'Electricidad', slug: 'electricidad' },
        ],
        zones: [{ id: 'uuid-centro', name: 'Centro', slug: 'centro' }, { id: 'uuid-uncas', name: 'Uncas', slug: 'uncas' }],
      }),
    );
    const text = el.textContent ?? '';
    expect(text).toContain('Ana uuid-1');
    expect(text).toContain('Bio real del profesional.');
    expect(text).toContain('Electricidad');
    expect(text).toContain('Centro, Uncas');
    expect(text).toContain('Todavía no tiene reseñas');
    expect(text).not.toContain('Trabajos realizados'); // sin portfolio, sin sección
    // Verificaciones: nada si el backend no tiene ninguna aprobada (aunque Electricidad requiera matrícula).
    expect(text).not.toContain('Identidad verificada');
    expect(text).not.toContain('Matrícula verificada');
    expect(text).not.toMatch(/@|\+54|tiempo de respuesta|Responde/);
  });

  it('verificaciones públicas y reseñas reales cuando el backend las trae', async () => {
    const el = await openProfile(
      detail('uuid-1', {
        averageRating: 4.5,
        reviewsCount: 2,
        verifications: { identity: true, phone: false, license: true, licenses: [{ serviceId: 'uuid-electricidad', reference: 'Mat. 123' }] },
        ratingDistribution: [{ stars: 5, count: 1 }, { stars: 4, count: 1 }, { stars: 3, count: 0 }, { stars: 2, count: 0 }, { stars: 1, count: 0 }],
        reviews: [
          { id: 'r1', rating: 5, comment: 'Muy prolijo', verifiedWork: true, author: 'María G.', zone: 'Centro', service: 'Plomería', createdAt: '2026-09-01T12:00:00Z' },
        ],
        portfolio: [{ id: 'p1', title: 'Baño nuevo', imageUrl: 'https://cdn.test/p1.jpg', zone: 'Centro', verifiedWork: true }],
      }),
    );
    const text = el.textContent ?? '';
    expect(text).toContain('Identidad verificada');
    expect(text).toContain('Matrícula verificada · Electricidad');
    expect(text).toContain('Mat. 123');
    expect(text).toContain('Muy prolijo');
    expect(text).toContain('María G.');
    expect(el.querySelector<HTMLImageElement>('img[alt="Baño nuevo"]')?.getAttribute('loading')).toBe('lazy');
  });

  it('404 → "No encontramos este profesional."', async () => {
    const el = await openProfile({ status: 404 });
    expect(el.textContent).toContain('No encontramos este profesional.');
  });
});

describe('RequestStore y comparador con profesionales reales', () => {
  it('el pedido guarda el professionalId y el serviceId reales', async () => {
    const { http } = setup();
    loadCatalog(http);
    const request = TestBed.inject(RequestStore);
    request.setService(SERVICES[1]);
    request.askProfessionals([pro('uuid-1'), pro('uuid-1'), pro('uuid-2')]);
    expect(request.recipients()).toEqual([
      expect.objectContaining({ id: 'uuid-1', displayName: 'Ana uuid-1', avatarUrl: null }),
      expect.objectContaining({ id: 'uuid-2' }),
    ]);
    expect(request.recipients()[0]).not.toHaveProperty('bio');
    expect(request.draft().service.id).toBe('uuid-plomeria');
    expect(request.recipientIds()).toEqual(['uuid-1', 'uuid-2']);
    http.expectNone(`${API}/requests`); // elegir profesionales no envía nada
  });

  it('compara hasta 3 con datos reales y sin métricas inexistentes', () => {
    const { http } = setup();
    loadCatalog(http);
    TestBed.inject(RequestStore).setService(SERVICES[0]); // Electricidad: requiere matrícula
    const search = TestBed.inject(SearchStore);
    search.toggleSelected(pro('uuid-1', { averageRating: 4.9, reviewsCount: 10, availableToday: true }));
    search.toggleSelected(pro('uuid-2'));
    search.toggleSelected(pro('uuid-3'));
    search.toggleSelected(pro('uuid-4'));
    expect(search.selectedIds()).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
    const rows = search.compareRows();
    const labels = rows.map((r) => r.label);
    for (const fake of ['Distancia', 'Responde en', 'Próximo turno', 'Precio']) expect(labels).not.toContain(fake);
    expect(labels).toContain('Matrícula');
    const rating = rows.find((r) => r.label === 'Valoración')!;
    expect(rating.cells.map((c) => c.value)).toEqual(['★ 4,9', 'Sin reseñas todavía', 'Sin reseñas todavía']);
    expect(rating.cells.map((c) => c.best)).toEqual([true, false, false]);
    expect(rows.find((r) => r.label === 'Matrícula')!.cells.every((c) => c.value === 'Sin matrícula verificada')).toBe(true);
  });
});
