import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_URL } from '../api/api.config';
import { RequestJourneyTracker } from '../analytics/request-journey-tracker';
import { Category, Service } from '../models/category';
import { LocalityRef } from '../models/locality';
import { CatalogStore } from './catalog.store';
import { LocalityStore } from './locality.store';
import { TEST_LOCALITY, useTestLocality } from './locality.testing';
import { RequestStore } from './request.store';
import { HomePage } from '../../features/client/home/home-page';
import { UrgentPage } from '../../features/client/urgent/urgent-page';

/**
 * Enlaces con ciudad a `/` y a `/urgencias` (`?provincia=<slug>&ciudad=<slug>`): se resuelven con el
 * mismo catálogo que `/profesionales`; nunca se asume una ciudad ni se pisa la ubicación del pedido.
 */
const API = 'http://api.test/api/v1';
const MDP: LocalityRef = {
  id: '99999999-9999-4999-8999-000000000003',
  name: 'Mar del Plata',
  slug: 'mar-del-plata',
  province: { name: 'Buenos Aires', slug: 'buenos-aires' },
  label: 'Mar del Plata, Buenos Aires',
  path: 'buenos-aires/mar-del-plata',
};
const MDP_DETAIL = { ...MDP, department: 'General Pueyrredón', hasNeighborhoods: false, professionalsCount: 2 };
const PC: Service = { id: '66666666-6666-4666-8666-666666666666', name: 'Reparación de PC', slug: 'reparacion-de-pc', categoryId: 'tec', requiresLicense: false };
const CATEGORIES: Category[] = [{ id: 'tec', name: 'Tecnología', slug: 'tecnologia' } as Category];
const BAD = 'http://api.test/api/v1/provinces/buenos-aires/localities/narnia';

function setup(withStoredCity: boolean) {
  localStorage.clear();
  sessionStorage.clear();
  if (withStoredCity) useTestLocality();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter(
        [
          { path: '', component: HomePage },
          { path: 'urgencias', component: UrgentPage },
        ],
        withComponentInputBinding(),
      ),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(CatalogStore).loadCatalog();
  http.expectOne(`${API}/categories`).flush(CATEGORIES);
  http.expectOne(`${API}/services`).flush([PC]);
  return http;
}

/** Contesta lo que cargan las pantallas (listas, barrios, vitrina) con vacíos. */
function drain(http: HttpTestingController) {
  for (const req of http.match(() => true)) {
    if (req.cancelled) continue;
    const url = req.request.url;
    if (url.endsWith('/zones') || url.endsWith('/neighborhoods')) req.flush([]);
    else if (url.includes('popular')) req.flush({ slugs: [] });
    else if (url.includes('/professionals') || url.includes('/home'))
      req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    else req.flush({});
  }
}

const settle = async (h: RouterTestingHarness) => {
  await h.fixture.whenStable();
  h.detectChanges();
};
const notice = (h: RouterTestingHarness) =>
  h.fixture.nativeElement.querySelector('[data-testid="locality-link-notice"]') as HTMLElement | null;

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe.each([
  ['/', 'inicio'],
  ['/urgencias', 'urgencias'],
])('enlace con ciudad a %s (%s)', (path) => {
  it('localidad válida: se refleja en el selector y es la ciudad de búsqueda', async () => {
    const http = setup(false);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${path === '/' ? '' : path}?provincia=buenos-aires&ciudad=mar-del-plata`);
    http.expectOne(`${API}/provinces/buenos-aires/localities/mar-del-plata`).flush(MDP_DETAIL);
    await settle(harness);
    if (path === '/urgencias') {
      // La búsqueda de urgencias usa la ciudad del enlace.
      const lists = http.match((r) => r.url === `${API}/professionals`);
      expect(lists.length).toBeGreaterThan(0);
      expect(lists.at(-1)!.request.params.get('locality')).toBe(MDP.id);
      lists.forEach((r) => r.flush({ items: [], total: 0, page: 1, pageSize: 20 }));
    }
    drain(http);
    await settle(harness);
    const locality = TestBed.inject(LocalityStore);
    expect(locality.current()?.id).toBe(MDP.id);
    expect(locality.source()).toBe('url');
    expect(notice(harness)).toBeNull();
    expect(harness.fixture.nativeElement.textContent).toContain('Mar del Plata');
    // No es una elección de la persona: no se guarda en el navegador.
    expect(localStorage.getItem('resuelve-locality')).toBeNull();
  });

  it('localidad inexistente: avisa, no la reemplaza por otra y deja elegir', async () => {
    const http = setup(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${path === '/' ? '' : path}?provincia=buenos-aires&ciudad=narnia`);
    http.expectOne(BAD).flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
    await settle(harness);
    drain(http);
    await settle(harness);
    const el = notice(harness)!;
    expect(el.textContent).toContain('No encontramos la ciudad del enlace');
    // La ciudad que ya tenía la persona se nombra: no se cambió ni se oculta que se sigue con esa.
    expect(el.textContent).toContain('Tandil, Buenos Aires');
    expect(el.querySelector('app-locality-picker')).not.toBeNull();
    expect(TestBed.inject(LocalityStore).current()?.id).toBe(TEST_LOCALITY.id);
  });

  it('localidad inexistente y sin ciudad guardada: no se asume ninguna', async () => {
    const http = setup(false);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${path === '/' ? '' : path}?provincia=buenos-aires&ciudad=narnia`);
    http.expectOne(BAD).flush({}, { status: 404, statusText: 'Not Found' });
    await settle(harness);
    drain(http);
    await settle(harness);
    expect(TestBed.inject(LocalityStore).current()).toBeNull();
    expect(notice(harness)!.textContent).toContain('Elegí la ciudad donde buscás');
  });

  it('parámetros incompletos (falta la provincia): ambiguo, no se adivina por el nombre', async () => {
    const http = setup(false);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`${path === '/' ? '' : path}?ciudad=san-martin`);
    await settle(harness);
    drain(http);
    await settle(harness);
    http.expectNone((r) => r.url.includes('/localities'));
    expect(TestBed.inject(LocalityStore).current()).toBeNull();
    expect(notice(harness)!.textContent).toContain('no indica la provincia y la ciudad completas');
  });

  it('sin parámetros: comportamiento de siempre (la ciudad elegida, sin aviso ni pedidos al catálogo)', async () => {
    const http = setup(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path === '/' ? '' : path);
    await settle(harness);
    drain(http);
    await settle(harness);
    http.expectNone((r) => r.url.includes('/provinces/'));
    expect(notice(harness)).toBeNull();
    expect(TestBed.inject(LocalityStore).current()?.id).toBe(TEST_LOCALITY.id);
    expect(TestBed.inject(LocalityStore).source()).toBe('user');
  });
});

describe('enlace con ciudad y un pedido en curso', () => {
  function orderIn(locality: LocalityRef) {
    const store = TestBed.inject(RequestStore);
    store.resetForNewRequest();
    store.setService(PC);
    store.updateDescription('La PC no prende desde ayer.');
    store.setLocality(locality);
    return store;
  }

  it('/urgencias?pedido=1 con otra ciudad: la ubicación del trabajo NO cambia y se avisa', async () => {
    const http = setup(true);
    const store = orderIn(TEST_LOCALITY);
    const before = JSON.stringify(store.draft().locality);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/urgencias?pedido=1&provincia=buenos-aires&ciudad=mar-del-plata');
    await settle(harness);
    drain(http);
    await settle(harness);
    // No hace falta pedir la otra ciudad: el pedido manda y su contexto sigue entero.
    http.expectNone(`${API}/provinces/buenos-aires/localities/mar-del-plata`);
    expect(JSON.stringify(store.draft().locality)).toBe(before);
    expect(store.draft().service.slug).toBe(PC.slug);
    expect(store.draft().description).toBe('La PC no prende desde ayer.');
    expect(TestBed.inject(LocalityStore).current()?.id).toBe(TEST_LOCALITY.id);
    expect(notice(harness)!.textContent).toContain('Tu pedido es en Tandil, Buenos Aires');
  });

  it('/urgencias sin pedido=1 con otra ciudad: se navega en la del enlace y el pedido guarda la suya', async () => {
    const http = setup(true);
    const store = orderIn(TEST_LOCALITY);
    const journeyId = TestBed.inject(RequestJourneyTracker).attemptId();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/urgencias?provincia=buenos-aires&ciudad=mar-del-plata');
    http.expectOne(`${API}/provinces/buenos-aires/localities/mar-del-plata`).flush(MDP_DETAIL);
    await settle(harness);
    drain(http);
    await settle(harness);
    expect(TestBed.inject(LocalityStore).current()?.id).toBe(MDP.id);
    // La ciudad de navegación cambió; la ubicación del trabajo, la descripción y el servicio, no.
    expect(store.draft().locality?.id).toBe(TEST_LOCALITY.id);
    expect(store.draft().description).toBe('La PC no prende desde ayer.');
    expect(store.draft().service.slug).toBe(PC.slug);
    expect(TestBed.inject(RequestJourneyTracker).attemptId()).toBe(journeyId);
  });

  it('el inicio con otra ciudad tampoco toca el pedido', async () => {
    const http = setup(true);
    const store = orderIn(TEST_LOCALITY);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('?provincia=buenos-aires&ciudad=mar-del-plata');
    http.expectOne(`${API}/provinces/buenos-aires/localities/mar-del-plata`).flush(MDP_DETAIL);
    await settle(harness);
    drain(http);
    expect(TestBed.inject(LocalityStore).current()?.id).toBe(MDP.id);
    expect(store.draft().locality?.id).toBe(TEST_LOCALITY.id);
  });
});
