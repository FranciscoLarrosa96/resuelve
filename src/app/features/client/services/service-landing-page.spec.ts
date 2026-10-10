import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_URL } from '../../../core/api/api.config';
import { ServiceLandingPage } from './service-landing-page';

const API = 'http://api.test/api/v1';
const categories = [{ id: 'c1', name: 'Hogar y reparaciones', slug: 'hogar-y-reparaciones', services: [] }];
const services = [
  { id: 's1', name: 'Gas', slug: 'gas', categoryId: 'c1', requiresLicense: true },
  { id: 's2', name: 'Plomería', slug: 'plomeria', categoryId: 'c1', requiresLicense: false },
];

function render(slug: string, place?: { province: string; locality: string }) {
  TestBed.configureTestingModule({
    imports: [ServiceLandingPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug, ...place })) } },
    ],
  });
  const fixture = TestBed.createComponent(ServiceLandingPage);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${API}/categories`).flush(categories);
  http.expectOne((r) => r.url === `${API}/services`).flush(services);
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

const TANDIL = {
  id: '99999999-9999-4999-8999-000000000001',
  name: 'Tandil',
  slug: 'tandil',
  department: null,
  province: { id: 'p6', name: 'Buenos Aires', slug: 'buenos-aires' },
  label: 'Tandil, Buenos Aires',
  path: 'buenos-aires/tandil',
  hasNeighborhoods: true,
  professionalsCount: 4,
};

describe('ServiceLandingPage', () => {
  it('nacional: oficio sin ciudad asumida, profesionales reales y enlaces a las localidades con oferta', async () => {
    const { fixture, http, el } = render('gas');
    http
      .expectOne((r) => r.url === `${API}/localities/served` && r.params.get('service') === 'gas')
      .flush({ items: [{ ...TANDIL, professionalsCount: 2 }] });
    const req = http.expectOne((r) => r.url === `${API}/professionals`);
    expect(req.request.params.get('service')).toBe('gas');
    expect(req.request.params.get('pageSize')).toBe('12');
    req.flush({
      items: [
        { slug: 'ana-gomez', displayName: 'Ana Gómez', headline: 'Gasista matriculada', averageRating: 4.75, reviewsCount: 8 },
        { slug: 'beto-paz', displayName: 'Beto Paz', headline: null, averageRating: null, reviewsCount: 0 },
      ],
      page: 1,
      pageSize: 12,
      total: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe('Gasistas · Gas | Resuelve');
    expect(el.querySelector('h1')!.textContent?.trim()).toBe('Gasistas');
    expect(req.request.params.has('locality')).toBe(false);
    expect(el.querySelector('a[href="/ciudades/buenos-aires/tandil/servicios/gas"]')?.textContent).toContain('Tandil, Buenos Aires');
    const profiles = [...el.querySelectorAll('a[href^="/p/"]')].map((a) =>
      [a.getAttribute('href'), ...[...a.querySelectorAll('span')].map((s) => s.textContent!.trim())],
    );
    expect(profiles).toEqual([
      ['/p/ana-gomez', 'Ana Gómez', 'Gasista matriculada · 4,8 ★ · 8 reseñas'],
      ['/p/beto-paz', 'Beto Paz'],
    ]);
    expect(el.textContent).toContain('¿Los gasistas están matriculados?');
    http.verify();
  });

  it('por localidad: "Plomeros en Tandil", solo profesionales de Tandil, canonical e indexable con oferta', async () => {
    const { fixture, http, el } = render('plomeria', { province: 'buenos-aires', locality: 'tandil' });
    http
      .expectOne((r) => r.url === `${API}/provinces/buenos-aires/localities/tandil` && r.params.get('service') === 'plomeria')
      .flush({ ...TANDIL, serviceProfessionalsCount: 3 });
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${API}/professionals`);
    expect(req.request.params.get('locality')).toBe(TANDIL.id);
    req.flush({ items: [], page: 1, pageSize: 12, total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Title).getTitle()).toBe('Plomero en Tandil · Plomería | Resuelve');
    expect(el.querySelector('h1')!.textContent).toContain('Plomeros en Tandil');
    expect(el.textContent).toContain('¿Cómo consigo un plomero en Tandil?');
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
      /\/ciudades\/buenos-aires\/tandil\/servicios\/plomeria$/,
    );
    http.verify();
  });

  it('localidad sin profesionales del servicio: se ve, pero noindex y sin canonical (nunca páginas vacías indexadas)', async () => {
    const { fixture, http, el } = render('plomeria', { province: 'buenos-aires', locality: 'azul' });
    http
      .expectOne((r) => r.url === `${API}/provinces/buenos-aires/localities/azul`)
      .flush({ ...TANDIL, id: 'azul-id', name: 'Azul', slug: 'azul', serviceProfessionalsCount: 0, professionalsCount: 0 });
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/professionals`).flush({ items: [], page: 1, pageSize: 12, total: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no hay profesionales de plomería que trabajen en Azul');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('si la lista de profesionales falla, la página sale igual y sin la sección', async () => {
    const { fixture, http, el } = render('plomeria');
    http.expectOne((r) => r.url === `${API}/localities/served`).flush({ items: [] });
    http.expectOne((r) => r.url === `${API}/professionals`).flush('x', { status: 503, statusText: 'down' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('h1')!.textContent).toContain('Plomeros');
    expect(el.textContent).not.toContain('Plomeros en Resuelve');
    expect(el.textContent).toContain('¿Cómo consigo un plomero?');
    expect(el.textContent).not.toContain('matriculados?');
  });
});
