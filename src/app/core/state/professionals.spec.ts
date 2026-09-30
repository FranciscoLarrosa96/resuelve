import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { API_URL } from '../api/api.config';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { Category, Service, Zone } from '../models/category';
import { ProfessionalDetail, ProfessionalSummary } from '../models/professional';
import { ProfessionalProfilePage } from '../../features/client/professional-profile/professional-profile-page';
import { CatalogStore } from './catalog.store';
import { EMPTY_LIST_FILTERS, PROFESSIONALS_ERROR, ProfessionalsStore } from './professionals.store';
import { RequestStore } from './request.store';
import { SearchStore } from './search.store';
import { ComparisonStore } from './comparison.store';
import { ToastService } from '../services/toast.service';

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
  coversEntireCity: false,
  zones: [{ id: 'uuid-centro', name: 'Centro', slug: 'centro' }],
  verifications: { identity: false, phone: false, license: false, licenses: [] }, pro: false,
  ...overrides,
});
const page = (items: ProfessionalSummary[], total = items.length, n = 1) => ({ items, page: n, pageSize: 20, total });
const detail = (id: string, overrides: Partial<ProfessionalDetail> = {}): ProfessionalDetail => ({
  ...pro(id),
  workPhotos: [],
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

/** Abre resultados por la URL real (la URL decide si se explora o se usa un pedido). */
async function openAt(url: string, before?: () => void) {
  const { http, store } = setup();
  loadCatalog(http);
  before?.();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  http.expectOne(`${API}/zones?city=tandil`).flush(ZONES);
  return { http, store, fixture: harness.fixture, el: harness.fixture.nativeElement as HTMLElement };
}

describe('/profesionales: explorar vs. pedido real', () => {
  it('"Ver todos los profesionales" arranca limpio: sin pedido de ejemplo ni servicio', async () => {
    const { http, fixture, el } = await openAt('/profesionales');
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.params.has('service')).toBe(false);
    req.flush(page([pro('uuid-1')]));
    await refresh(fixture);
    expect(el.textContent).toContain('Profesionales en Tandil');
    for (const mock of ['Tu pedido', 'Pérdida bajo mesada', 'Barrio sin elegir', 'Editar pedido']) {
      expect(el.textContent).not.toContain(mock);
    }
    expect(TestBed.inject(RequestStore).hasContext()).toBe(false);
  });

  it('?servicio= filtra por ese servicio sin armar un pedido', async () => {
    const { http, fixture, el } = await openAt('/profesionales?servicio=plomeria');
    http.expectOne((r) => isList(r.url) && r.params.get('service') === 'uuid-plomeria').flush(page([]));
    await refresh(fixture);
    expect(el.textContent).toContain('Plomería en Tandil');
    expect(el.textContent).not.toContain('Tu pedido');
  });

  it('?pedido=1 sin un pedido real (borrador vacío o vencido) explora', async () => {
    const { http, fixture, el } = await openAt('/profesionales?pedido=1');
    const req = http.expectOne((r) => isList(r.url));
    expect(req.request.params.has('service')).toBe(false);
    req.flush(page([]));
    await refresh(fixture);
    expect(el.textContent).not.toContain('Tu pedido');
  });

  it('?pedido=1 con el pedido que armó el cliente: lo muestra y lo usa', async () => {
    const { http, fixture, el } = await openAt('/profesionales?pedido=1', () => {
      const request = TestBed.inject(RequestStore);
      request.setHomeText('Me pierde agua abajo de la pileta');
      expect(request.startFromHome()).toBe(true);
    });
    http.expectOne((r) => isList(r.url) && r.params.get('service') === 'uuid-plomeria').flush(page([]));
    await refresh(fixture);
    expect(el.textContent).toContain('Tu pedido');
    expect(el.textContent).toContain('Profesionales para Plomería');
  });

  it('pedir presupuesto explorando arma un pedido NUEVO y vacío con el servicio filtrado', async () => {
    const { http, fixture, el } = await openAt('/profesionales?servicio=plomeria');
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    await refresh(fixture);
    Array.from(el.querySelectorAll<HTMLButtonElement>('app-result-card button')).find((b) => b.textContent?.includes('Pedir presupuesto'))!.click();
    const request = TestBed.inject(RequestStore);
    expect(request.draft().service.id).toBe('uuid-plomeria');
    expect(request.draft().description).toBe('');
    expect(request.recipientIds()).toEqual(['uuid-1']);
  });
});

describe('listado /profesionales', () => {
  const openResults = () => openAt('/profesionales?servicio=plomeria');

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
    expect(el.textContent).toContain('Plomería en Tandil');
    expect(el.textContent).toContain('1 profesional');
    expect(el.textContent).toContain('¿Querés recibir varias propuestas? Seleccioná profesionales y pediles presupuesto al mismo tiempo.');
    const ask = Array.from(el.querySelectorAll<HTMLButtonElement>('app-result-card button')).find((b) => b.textContent?.includes('Pedir presupuesto'))!;
    expect(ask.title).toBe('Se enviará a este profesional.');
    const compare = Array.from(el.querySelectorAll<HTMLButtonElement>('app-result-card button')).find((b) => b.textContent?.includes('Seleccionar para comparar'))!;
    expect(compare.title).toBe('Seleccionar para comparar');
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

  it('la bandeja separa comparar perfiles de enviar el mismo pedido a varios', async () => {
    const { http, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1'), pro('uuid-2')]));
    await refresh(fixture);
    const comparison = TestBed.inject(ComparisonStore);
    comparison.add(pro('uuid-1'));
    comparison.add(pro('uuid-2'));
    await refresh(fixture);
    const tray = el.querySelector('[data-testid="compare-tray"]')!;
    expect(tray.textContent).toContain('Comparar perfiles');
    expect(tray.textContent).toContain('Pedir presupuesto a los 2');
    expect(tray.textContent).toContain('Se enviará el mismo pedido a los 2 profesionales seleccionados.');
  });

  it('la bandeja flotante aparece al primero, actualiza chips y desaparece al limpiar sin desplazar la página', async () => {
    const { http, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1'), pro('uuid-2'), pro('uuid-3')]));
    await refresh(fixture);
    const comparison = TestBed.inject(ComparisonStore);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    expect(el.querySelector('[data-testid="compare-tray"]')).toBeNull();

    comparison.add(pro('uuid-1'));
    await refresh(fixture);
    const trays = [...el.querySelectorAll<HTMLElement>('[data-testid="compare-tray"]')];
    expect(trays).toHaveLength(1);
    expect(trays[0].classList.contains('fixed')).toBe(true);
    expect(el.querySelector('app-mobile-nav')).toBeTruthy();
    expect(trays[0].textContent).toContain('1 seleccionado');
    expect(trays[0].querySelector<HTMLButtonElement>('button[aria-label="Quitar a Ana uuid-1 de la comparación"]')).toBeTruthy();

    comparison.add(pro('uuid-2'));
    comparison.add(pro('uuid-3'));
    await refresh(fixture);
    expect(trays[0].textContent).toContain('3 seleccionados');
    expect(trays[0].textContent).toContain('Pedir presupuesto a los 3');
    trays[0].querySelector<HTMLButtonElement>('button[aria-label="Quitar a Ana uuid-2 de la comparación"]')!.click();
    await refresh(fixture);
    expect(comparison.selectedIds()).toEqual(['uuid-1', 'uuid-3']);
    expect(trays[0].textContent).toContain('Pedir presupuesto a los 2');

    const compare = [...trays[0].querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Comparar perfiles'))!;
    compare.click();
    await refresh(fixture);
    expect(comparison.open()).toBe(true);
    comparison.close();
    await refresh(fixture);
    comparison.clear();
    await refresh(fixture);
    expect(el.querySelector('[data-testid="compare-tray"]')).toBeNull();
    comparison.add(pro('uuid-1'));
    comparison.add(pro('uuid-3'));
    await refresh(fixture);
    const askTray = el.querySelector<HTMLElement>('[data-testid="compare-tray"]')!;
    const ask = [...askTray.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Pedir presupuesto a los 2'))!;
    ask.click();
    expect(TestBed.inject(RequestStore).recipientIds()).toEqual(['uuid-1', 'uuid-3']);
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it('zona y disponibilidad filtran en el backend', async () => {
    const { http, store, fixture, el } = await openResults();
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-1')]));
    await refresh(fixture);
    const select = el.querySelector<HTMLSelectElement>('#results-zone-desktop')!;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Todo Tandil', 'Centro', 'Uncas']);
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
    expect(el.textContent).toContain('Todavía no hay profesionales de Plomería en Tandil.');
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
  let profileFixture: { detectChanges(): void; whenStable(): Promise<unknown> };
  async function openProfile(response: ProfessionalDetail | { status: number }) {
    const { http } = setup();
    loadCatalog(http);
    const fixture = TestBed.createComponent(ProfessionalProfilePage);
    profileFixture = fixture;
    fixture.componentRef.setInput('id', 'uuid-1');
    await fixture.whenStable();
    const req = http.expectOne(`${API}/professionals/uuid-1`);
    if ('status' in response) req.flush({ code: 'NOT_FOUND' }, { status: response.status, statusText: 'x' });
    else req.flush(response);
    await refresh(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra datos reales, sin reseñas ni fotos de trabajos inventadas y sin datos privados', async () => {
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
    expect(text).not.toContain('Trabajos realizados'); // sin fotos, sin sección
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
          { id: 'r1', rating: 5, comment: 'Muy prolijo', reviewerDisplayName: 'María', createdAt: '2026-09-01T12:00:00Z' },
        ],
        workPhotos: [{ id: 'p1', url: 'https://cdn.test/p1.jpg', caption: 'Baño nuevo', sortOrder: 0 }],
      }),
    );
    const text = el.textContent ?? '';
    expect(text).toContain('Identidad verificada');
    expect(text).toContain('Matrícula verificada · Electricidad');
    expect(text).toContain('Mat. 123');
    expect(text).toContain('Muy prolijo');
    expect(text).toContain('María · septiembre 2026');
    expect(el.querySelector<HTMLImageElement>('img[alt="Baño nuevo"]')?.getAttribute('loading')).toBe('lazy');
  });

  describe('Trabajos realizados (galería pública)', () => {
    const photos = [0, 1, 2].map((i) => ({
      id: `w${i}`,
      url: `https://res.test/image/upload/c_limit,w_1600,h_1600,q_auto,f_auto/v1/w${i}.jpg`,
      caption: i === 1 ? null : `Trabajo ${i}`,
      sortOrder: i,
    }));
    const galleries = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('[data-testid="work-gallery"]');

    it('sin fotos no hay sección vacía', async () => {
      const el = await openProfile(detail('uuid-1'));
      expect(galleries(el)).toHaveLength(0);
      expect(el.textContent).not.toContain('Trabajos realizados');
    });

    it('con fotos: grilla en desktop y carrusel con snap en mobile, en orden y con texto alternativo', async () => {
      const el = await openProfile(detail('uuid-1', { workPhotos: [...photos].reverse() }));
      expect(galleries(el).length).toBeGreaterThan(0);
      const gallery = galleries(el)[0];
      expect(gallery.querySelector('h2')!.textContent).toContain('Trabajos realizados');
      const list = gallery.querySelector('ul')!;
      expect(list.className).toContain('snap-x');
      expect(list.className).toContain('sm:grid');
      const imgs = [...gallery.querySelectorAll<HTMLImageElement>('li img')];
      expect(imgs.map((i) => i.alt)).toEqual(['Trabajo 0', 'Trabajo realizado por Ana (2 de 3)', 'Trabajo 2']);
      expect(imgs[0].getAttribute('loading')).toBe('lazy');
    });

    it('lightbox: abre la foto, anterior/siguiente (botones y flechas), Escape cierra y devuelve el foco', async () => {
      const el = await openProfile(detail('uuid-1', { workPhotos: photos }));
      document.body.appendChild(el);
      const gallery = galleries(el)[0];
      const thumbs = gallery.querySelectorAll<HTMLButtonElement>('li button');
      thumbs[0].focus();
      thumbs[0].click();
      await Promise.resolve();
      const box = gallery.parentElement!.querySelector<HTMLDialogElement>('[data-testid="work-lightbox"]')!;
      const fixtureTick = () => new Promise((r) => setTimeout(r));
      await fixtureTick();
      expect(box.hasAttribute('open')).toBe(true);
      expect(box.textContent).toContain('Trabajo 1 de 3');
      const prev = box.querySelector<HTMLButtonElement>('[aria-label="Foto anterior"]')!;
      expect(prev.disabled).toBe(true);
      box.querySelector<HTMLButtonElement>('[aria-label="Foto siguiente"]')!.click();
      await fixtureTick();
      expect(box.textContent).toContain('Trabajo 2 de 3');
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await fixtureTick();
      expect(box.textContent).toContain('Trabajo 3 de 3');
      expect(box.querySelector<HTMLImageElement>('img')!.alt).toBe('Trabajo 2');
      box.dispatchEvent(new Event('cancel', { cancelable: true }));
      await fixtureTick();
      expect(box.hasAttribute('open')).toBe(false);
      expect(document.activeElement).toBe(thumbs[0]);
      el.remove();
    });

    it('una foto que no carga se oculta (si ninguna carga, no queda sección)', async () => {
      const el = await openProfile(detail('uuid-1', { workPhotos: [photos[0]] }));
      // Desktop y mobile: cada galería oculta sus fotos rotas.
      for (const g of galleries(el)) g.querySelector('img')!.dispatchEvent(new Event('error'));
      await refresh(profileFixture);
      expect(galleries(el)).toHaveLength(0);
    });
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
    request.askProfessionals([pro('uuid-1'), pro('uuid-1'), pro('uuid-2')], 'DISCOVERY');
    expect(request.recipients()).toEqual([
      expect.objectContaining({ id: 'uuid-1', displayName: 'Ana uuid-1', avatarUrl: null }),
      expect.objectContaining({ id: 'uuid-2' }),
    ]);
    expect(request.recipients()[0]).not.toHaveProperty('bio');
    expect(request.draft().service.id).toBe('uuid-plomeria');
    expect(request.recipientIds()).toEqual(['uuid-1', 'uuid-2']);
    http.expectNone(`${API}/requests`); // elegir profesionales no envía nada
  });

  it('compara hasta 6 con datos reales y sin métricas inexistentes', () => {
    const { http } = setup();
    loadCatalog(http);
    // Electricidad (requiere matrícula) filtra el listado.
    TestBed.inject(ProfessionalsStore).filters.set({ ...EMPTY_LIST_FILTERS, serviceId: 'uuid-electricidad' });
    const search = TestBed.inject(SearchStore);
    search.toggleSelected(pro('uuid-1', { averageRating: 4.9, reviewsCount: 10, availableToday: true }));
    search.toggleSelected(pro('uuid-2'));
    search.toggleSelected(pro('uuid-3'));
    search.toggleSelected(pro('uuid-4'));
    search.toggleSelected(pro('uuid-5'));
    search.toggleSelected(pro('uuid-6'));
    expect(search.selectedIds()).toEqual(['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4', 'uuid-5', 'uuid-6']);
    const rows = search.compareRows();
    const labels = rows.map((r) => r.label);
    for (const fake of ['Distancia', 'Responde en', 'Próximo turno', 'Precio']) expect(labels).not.toContain(fake);
    // La matrícula se compara SOLO con contexto de servicio, y lo dice.
    expect(labels).toContain('Matrícula (Electricidad)');
    const rating = rows.find((r) => r.label === 'Valoración')!;
    expect(rating.cells.map((c) => c.value)).toEqual([
      '★ 4,9', 'Sin reseñas todavía', 'Sin reseñas todavía', 'Sin reseñas todavía', 'Sin reseñas todavía', 'Sin reseñas todavía',
    ]);
    expect(rating.cells.map((c) => c.best)).toEqual([true, false, false, false, false, false]);
    expect(rows.find((r) => r.label === 'Matrícula (Electricidad)')!.cells.every((c) => c.value === 'Sin matrícula verificada')).toBe(true);
  });
});

describe('PRO y destacados en lo público', () => {
  async function results(service: Service, items: ProfessionalSummary[]) {
    const { http, fixture } = await openAt(`/profesionales?servicio=${service.slug}`);
    http.expectOne((r) => isList(r.url)).flush(page(items));
    await refresh(fixture);
    return fixture.nativeElement as HTMLElement;
  }
  /** Tarjetas visibles en desktop (el listado mobile repite los mismos datos). */
  const cards = (el: HTMLElement) => [...el.querySelectorAll('app-result-card')] as HTMLElement[];

  it('"Destacado" solo con placement real y badge PRO solo con plan real; los FREE siguen apareciendo', async () => {
    const el = await results(SERVICES[1], [
      pro('uuid-pro', { pro: true, isFeaturedPlacement: true }),
      pro('uuid-free', { isFeaturedPlacement: false }),
      pro('uuid-pro-organico', { pro: true, isFeaturedPlacement: false }),
    ]);
    const [featured, free, organicPro] = cards(el);
    expect(featured.querySelector('app-featured-label')?.textContent).toContain('Destacado');
    expect(featured.querySelector('app-pro-badge')?.textContent).toContain('PRO');
    expect(free.textContent).toContain('Ana uuid-free');
    expect(free.querySelector('app-featured-label, app-pro-badge')).toBeNull();
    expect(organicPro.querySelector('app-pro-badge')).not.toBeNull();
    expect(organicPro.querySelector('app-featured-label')).toBeNull();
  });

  it('PRO no se confunde con matrícula: son señales separadas', async () => {
    const licensed = { identity: false, phone: false, license: true, licenses: [{ serviceId: 'uuid-electricidad', reference: 'MP 1' }] };
    const el = await results(SERVICES[0], [
      pro('uuid-pro-sin', { pro: true, services: [{ id: 'uuid-electricidad', name: 'Electricidad', slug: 'electricidad' }] }),
      pro('uuid-free-mat', { verifications: licensed, services: [{ id: 'uuid-electricidad', name: 'Electricidad', slug: 'electricidad' }] }),
    ]);
    const [paid, licensedCard] = cards(el);
    expect(paid.querySelector('app-pro-badge')).not.toBeNull();
    expect(paid.textContent).not.toContain('Matrícula verificada');
    expect(licensedCard.textContent).toContain('Matrícula verificada');
    expect(licensedCard.querySelector('app-pro-badge')).toBeNull();
  });

  it('perfil público: badge PRO solo si el backend lo marca', async () => {
    for (const isPro of [true, false]) {
      TestBed.resetTestingModule();
      const { http } = setup();
      loadCatalog(http);
      const fixture = TestBed.createComponent(ProfessionalProfilePage);
      fixture.componentRef.setInput('id', 'uuid-1');
      await fixture.whenStable();
      http.expectOne(`${API}/professionals/uuid-1`).flush(detail('uuid-1', { pro: isPro }));
      await refresh(fixture);
      expect(!!(fixture.nativeElement as HTMLElement).querySelector('app-pro-badge')).toBe(isPro);
    }
  });
});

describe('Comparar desde el perfil (ComparisonStore, única fuente)', () => {
  const UUID1 = '11111111-1111-4111-8111-111111111111';
  const UUID2 = '22222222-2222-4222-8222-222222222222';

  async function profile(id: string, name: string) {
    const fixture = TestBed.createComponent(ProfessionalProfilePage);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    for (const r of http.match(`${API}/professionals/${id}`)) r.flush(detail(id, { firstName: name, displayName: `${name} Pérez` }));
    await refresh(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const buttonByText = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text));

  it('perfil → "Agregar a la comparación" → el store tiene el id, aparece la bandeja y "✓ En comparación"', async () => {
    const { http } = setup();
    loadCatalog(http);
    const { fixture, el } = await profile(UUID1, 'Francisco');
    buttonByText(el, 'Agregar a la comparación')!.click();
    await refresh(fixture);
    const comparison = TestBed.inject(ComparisonStore);
    expect(comparison.selectedIds()).toEqual([UUID1]);
    expect(el.querySelector('[data-testid="in-comparison"]')?.textContent).toContain('En comparación');
    const tray = el.querySelector('[data-testid="compare-tray"]')!;
    expect(tray.textContent).toContain('Comparar profesionales');
    expect(tray.textContent).toContain('Francisco');
    expect(tray.textContent).toContain('Sumá al menos otro perfil');
    // Con 1, "Comparar" está deshabilitado; "Agregar otro" vuelve al listado con contexto.
    const compare = [...tray.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Comparar perfiles'))!;
    expect(compare.disabled).toBe(true);
    expect(tray.querySelector('a')?.getAttribute('href')).toBe('/profesionales?servicio=plomeria');
  });

  it('2 profesionales → "Comparar perfiles" abre el comparador real; quitar lo saca', async () => {
    const { http } = setup();
    loadCatalog(http);
    const comparison = TestBed.inject(ComparisonStore);
    comparison.add(pro(UUID1, { firstName: 'Francisco', displayName: 'Francisco Pérez' }));
    const { fixture, el } = await profile(UUID2, 'Ariel');
    buttonByText(el, 'Agregar a la comparación')!.click();
    await refresh(fixture);
    expect(comparison.selectedIds()).toEqual([UUID1, UUID2]);
    const tray = el.querySelector('[data-testid="compare-tray"]')!;
    const compare = [...tray.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Comparar perfiles'))!;
    expect(compare.disabled).toBe(false);
    compare.click();
    await refresh(fixture);
    expect(comparison.open()).toBe(true);
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Comparar profesionales');
    expect(el.querySelector('[role="dialog"]')?.textContent).toContain('Mandá el mismo pedido a todos y elegí el presupuesto que más te convenga.');
    // Quitar desde la bandeja (botón con nombre accesible).
    comparison.close();
    await refresh(fixture);
    el.querySelector<HTMLButtonElement>('button[aria-label="Quitar a Francisco Pérez de la comparación"]')!.click();
    await refresh(fixture);
    expect(comparison.selectedIds()).toEqual([UUID2]);
    // Y desde el propio perfil.
    buttonByText(el, 'Quitar')!.click();
    await refresh(fixture);
    expect(comparison.selectedIds()).toEqual([]);
    expect(el.querySelector('[data-testid="compare-tray"]')).toBeNull();
  });

  it('máximo 6: el séptimo no entra y se avisa', () => {
    setup();
    const comparison = TestBed.inject(ComparisonStore);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(comparison.add(pro(id))).toBe(true);
    expect(comparison.add(pro('g'))).toBe(false);
    expect(comparison.selectedIds()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(TestBed.inject(ToastService).message()).toBe('Podés comparar hasta 6 profesionales.');
  });

  it('entrar a resultados (explorar o cambiar de servicio) NO vacía la comparación', async () => {
    const { http, fixture } = await openAt('/profesionales?servicio=plomeria', () => {
      TestBed.inject(ComparisonStore).add(pro(UUID1));
    });
    http.expectOne((r) => isList(r.url)).flush(page([pro('uuid-9')]));
    await refresh(fixture);
    expect(TestBed.inject(ComparisonStore).selectedIds()).toEqual([UUID1]);
    TestBed.inject(SearchStore).explore('uuid-pintura');
    http.expectOne((r) => isList(r.url)).flush(page([]));
    expect(TestBed.inject(ComparisonStore).selectedIds()).toEqual([UUID1]);
  });

  it('sobrevive a un F5 (sessionStorage, solo datos públicos) y descarta basura', () => {
    setup();
    TestBed.inject(ComparisonStore).add({ ...detail(UUID1), displayName: 'Ana Uno' });
    TestBed.tick();
    const saved = JSON.parse(sessionStorage.getItem('resuelve.comparison')!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toHaveProperty('workPhotos');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: API }] });
    expect(TestBed.inject(ComparisonStore).selectedIds()).toEqual([UUID1]);
    sessionStorage.setItem('resuelve.comparison', '[{"id":"no-uuid"}]');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: API }] });
    expect(TestBed.inject(ComparisonStore).selectedIds()).toEqual([]);
  });
});
