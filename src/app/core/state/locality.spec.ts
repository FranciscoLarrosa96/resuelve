import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../api/api.config';
import { LocalityOption } from '../models/locality';
import {
  LOCALITY_SEARCH_DEBOUNCE_MS,
  LocalitySearch,
} from '../../shared/components/locality-picker/locality-search';
import { LOCALITY_STORAGE_KEY, LocalityStore } from './locality.store';
import { TEST_LOCALITY } from './locality.testing';

const API = 'http://api.test/api/v1';
const MDP = {
  id: '99999999-9999-4999-8999-000000000003',
  name: 'Mar del Plata',
  slug: 'mar-del-plata',
  province: { name: 'Buenos Aires', slug: 'buenos-aires' },
  label: 'Mar del Plata, Buenos Aires',
  path: 'buenos-aires/mar-del-plata',
};
const option = (o: Partial<LocalityOption> & { id: string; name: string }): LocalityOption => ({
  slug: o.name.toLowerCase().replace(/ /g, '-'),
  department: null,
  province: { name: 'Buenos Aires', slug: 'buenos-aires' },
  label: `${o.name}, Buenos Aires`,
  path: `buenos-aires/${o.name.toLowerCase()}`,
  hasProfessionals: false,
  ...o,
});

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: API },
    ],
  });
  return { http: TestBed.inject(HttpTestingController) };
}

beforeEach(() => localStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify());

describe('LocalityStore: precedencia de la ciudad', () => {
  it('un visitante nuevo no tiene ciudad (nunca se le impone Tandil)', () => {
    setup();
    expect(TestBed.inject(LocalityStore).current()).toBeNull();
  });

  it('elegir la guarda en este navegador; una URL la muestra sin pisar lo guardado', () => {
    setup();
    const store = TestBed.inject(LocalityStore);
    store.choose(TEST_LOCALITY);
    expect(store.source()).toBe('user');
    expect(JSON.parse(localStorage.getItem(LOCALITY_STORAGE_KEY)!).id).toBe(TEST_LOCALITY.id);
    store.fromUrl(MDP);
    expect(store.current()?.id).toBe(MDP.id);
    expect(JSON.parse(localStorage.getItem(LOCALITY_STORAGE_KEY)!).id).toBe(TEST_LOCALITY.id);
  });

  it('una sugerencia nunca pisa una elección; sin elección, se usa', () => {
    setup();
    const store = TestBed.inject(LocalityStore);
    store.suggest(MDP);
    expect(store.current()?.id).toBe(MDP.id);
    store.choose(TEST_LOCALITY);
    store.suggest(MDP);
    expect(store.current()?.id).toBe(TEST_LOCALITY.id);
  });

  it('lo guardado sobrevive a una pestaña nueva (store nuevo)', () => {
    localStorage.setItem(LOCALITY_STORAGE_KEY, JSON.stringify(MDP));
    setup();
    expect(TestBed.inject(LocalityStore).current()).toEqual(MDP);
  });

  it('un valor guardado inválido se ignora', () => {
    localStorage.setItem(LOCALITY_STORAGE_KEY, '{"id":"x"}');
    setup();
    expect(TestBed.inject(LocalityStore).current()).toBeNull();
  });
});

@Component({
  imports: [LocalitySearch],
  template: `<app-locality-search [autofocus]="false" (picked)="picked = $event" />`,
})
class SearchHost {
  picked: LocalityOption | null = null;
}

describe('LocalitySearch (combobox)', () => {
  const wait = (ms = LOCALITY_SEARCH_DEBOUNCE_MS + 20) => new Promise((r) => setTimeout(r, ms));
  async function render() {
    const { http } = setup();
    const fixture = TestBed.createComponent(SearchHost);
    fixture.detectChanges();
    await wait();
    // Sin texto: sugerencias (ciudades con profesionales), una sola consulta.
    const initial = http.expectOne((r) => r.url === `${API}/localities` && !r.params.has('search'));
    initial.flush({ items: [] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input[role=combobox]')!;
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    };
    return { http, fixture, el, input, type };
  }

  it('debounce: escribir rápido hace UNA consulta con el último texto', async () => {
    const { http, type } = await render();
    type('m');
    type('ma');
    type('mar');
    await wait();
    const req = http.expectOne((r) => r.url === `${API}/localities`);
    expect(req.request.params.get('search')).toBe('mar');
    req.flush({ items: [] });
  });

  it('una respuesta vieja nunca pisa a la búsqueda nueva (se cancela)', async () => {
    const { http, fixture, el, type } = await render();
    type('tan');
    await wait();
    const old = http.expectOne((r) => r.params.get('search') === 'tan');
    type('mar del');
    await wait();
    expect(old.cancelled).toBe(true);
    http
      .expectOne((r) => r.params.get('search') === 'mar del')
      .flush({ items: [option({ id: MDP.id, name: 'Mar del Plata' })] });
    fixture.detectChanges();
    expect([...el.querySelectorAll('[role=option]')].map((o) => o.textContent)).toEqual([
      expect.stringContaining('Mar del Plata'),
    ]);
  });

  it('muestra localidad y provincia; homónimos con el departamento; teclado ↓ + Enter elige', async () => {
    const { http, fixture, el, input, type } = await render();
    type('el rincon');
    await wait();
    http
      .expectOne((r) => r.url === `${API}/localities`)
      .flush({
        items: [
          option({
            id: 'a',
            name: 'El Rincón',
            label: 'El Rincón (Albardón), San Juan',
            province: { name: 'San Juan', slug: 'san-juan' },
          }),
          option({
            id: 'b',
            name: 'El Rincón',
            label: 'El Rincón (Caucete), San Juan',
            province: { name: 'San Juan', slug: 'san-juan' },
          }),
        ],
      });
    fixture.detectChanges();
    const texts = [...el.querySelectorAll('[role=option]')].map((o) =>
      o.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(texts).toEqual(['El Rincón (Albardón)San Juan', 'El Rincón (Caucete)San Juan']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.picked?.id).toBe('b');
  });

  it('error: mensaje y Reintentar; sin resultados: aviso claro', async () => {
    const { http, fixture, el, type } = await render();
    type('xyz');
    await wait();
    http
      .expectOne((r) => r.params.get('search') === 'xyz')
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'No pudimos buscar localidades',
    );
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'))!.click();
    await wait();
    for (const req of http.match((r) => r.url === `${API}/localities`)) req.flush({ items: [] });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="locality-empty"]')?.textContent).toContain(
      'No encontramos “xyz”',
    );
  });
});
