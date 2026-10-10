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

function render(slug: string) {
  TestBed.configureTestingModule({
    imports: [ServiceLandingPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug })) } },
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

describe('ServiceLandingPage', () => {
  it('título y H1 por oficio, profesionales reales del servicio y preguntas frecuentes', async () => {
    const { fixture, http, el } = render('gas');
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

    expect(TestBed.inject(Title).getTitle()).toBe('Gasista en Tandil · Gas | Resuelve');
    expect(el.querySelector('h1')!.textContent).toContain('Gasistas en Tandil');
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

  it('si la lista de profesionales falla, la página sale igual y sin la sección', async () => {
    const { fixture, http, el } = render('plomeria');
    http.expectOne((r) => r.url === `${API}/professionals`).flush('x', { status: 503, statusText: 'down' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('h1')!.textContent).toContain('Plomeros en Tandil');
    expect(el.textContent).not.toContain('Plomeros de Tandil en Resuelve');
    expect(el.textContent).toContain('¿Cómo consigo un plomero en Tandil?');
    expect(el.textContent).not.toContain('matriculados?');
  });
});
