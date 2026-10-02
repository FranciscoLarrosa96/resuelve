import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { Zone } from '../../../core/models/category';
import { GeolocationError, GeolocationService } from '../../../core/services/geolocation.service';
import { RequestStore } from '../../../core/state/request.store';
import { QuoteRequestPage } from '../../../features/client/quote-request/quote-request-page';
import { RequestFlowPage } from '../../../features/client/request-flow/request-flow-page';
import { WorkLocationPicker } from './work-location-picker';

const API = 'http://api.test/api/v1';
const ZONES: Zone[] = [
  { id: '11111111-1111-4111-8111-000000000001', name: 'Centro', slug: 'centro', cityId: 'c' },
  { id: '11111111-1111-4111-8111-000000000002', name: 'Villa Italia', slug: 'villa-italia', cityId: 'c' },
  { id: '11111111-1111-4111-8111-000000000003', name: 'Uncas', slug: 'uncas', cityId: 'c' },
];

@Component({ imports: [WorkLocationPicker], template: `<app-work-location-picker idPrefix="t" />` })
class Host {}

type GeoMock = { supported: boolean; current: () => Promise<{ lat: number; lng: number }> };

async function render(opts: { enabled: boolean; geo?: Partial<GeoMock> }) {
  sessionStorage.clear();
  const geo: GeoMock = { supported: true, current: () => Promise.reject(new GeolocationError('denied')), ...opts.geo };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: API },
      { provide: GeolocationService, useValue: geo },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  http.expectOne(`${API}/zones?city=tandil`).flush(ZONES);
  http.expectOne(`${API}/location/config`).flush({ enabled: opts.enabled });
  await settle(fixture);
  return { http, fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(RequestStore) };
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

const type = (el: HTMLElement, value: string) => {
  const input = el.querySelector<HTMLInputElement>('#t-address')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
};
const buttonByText = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text));

afterEach(() => TestBed.inject(HttpTestingController).verify());

const zoneSearch = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[placeholder^="Escribí tu barrio"]')!;
/** Ofrece los barrios al enfocar el buscador (autocompletado de barrios). */
async function openZones(el: HTMLElement, fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  zoneSearch(el).dispatchEvent(new Event('focus'));
  await settle(fixture);
  return [...el.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => o.closest('[aria-label="Barrios"]'));
}

describe('WorkLocationPicker', () => {
  it('sin proveedor: no ofrece "Usar mi ubicación"; dirección + barrios reales siguen funcionando', async () => {
    const { el, fixture, store } = await render({ enabled: false });
    expect(buttonByText(el, 'Usar mi ubicación')).toBeUndefined();
    expect(el.querySelector('#t-address')?.getAttribute('role')).toBeNull();
    expect((await openZones(el, fixture)).map((b) => b.textContent?.trim())).toEqual(['Centro', 'Villa Italia', 'Uncas']);
    (await openZones(el, fixture)).find((o) => o.textContent?.trim() === 'Uncas')!.click();
    await settle(fixture);
    expect(store.draft().zone?.name).toBe('Uncas');
    expect(el.querySelector('[data-testid="zone-summary"]')?.textContent).toContain('Uncas');
    expect(el.querySelector('[data-testid="zone-summary"]')?.textContent).not.toContain('detectado');
  });

  it('la dirección que nombra UN barrio lo detecta y se puede cambiar; nunca se elige uno cualquiera', async () => {
    const { el, fixture, store } = await render({ enabled: false });
    type(el, 'Alem 455, Villa Italia');
    await settle(fixture);
    expect(store.exactAddress()).toBe('Alem 455, Villa Italia');
    expect(store.draft().zone?.name).toBe('Villa Italia');
    const summary = el.querySelector('[data-testid="zone-summary"]')!;
    expect(summary.textContent).toContain('Barrio detectado');
    buttonByText(el, 'Cambiar')!.click();
    await settle(fixture);
    expect((await openZones(el, fixture)).length).toBe(3);
    // Una dirección sin barrio reconocible no elige nada.
    store.clearZone();
    type(el, 'Calle 12 número 300');
    await settle(fixture);
    expect(store.draft().zone).toBeNull();
  });

  it('geolocalización denegada → aviso no bloqueante y se sigue con dirección/barrio', async () => {
    const { el, fixture, store, http } = await render({ enabled: true });
    buttonByText(el, 'Usar mi ubicación')!.click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="locate-message"]')?.textContent).toContain('No tenemos permiso para usar tu ubicación');
    http.expectNone(`${API}/location/reverse`);
    type(el, 'Alem 455');
    await settle(fixture);
    expect(store.exactAddress()).toBe('Alem 455');
    (await openZones(el, fixture)).find((o) => o.textContent?.trim() === 'Centro')!.click();
    await settle(fixture);
    expect(store.draft().zone?.name).toBe('Centro');
    await new Promise((r) => setTimeout(r, 350));
    http.match(`${API}/location/autocomplete`).forEach((r) => r.flush({ items: [] }));
  });

  it('timeout del navegador → mensaje propio', async () => {
    const { el, fixture } = await render({ enabled: true, geo: { current: () => Promise.reject(new GeolocationError('timeout')) } });
    buttonByText(el, 'Usar mi ubicación')!.click();
    await settle(fixture);
    expect(el.querySelector('[data-testid="locate-message"]')?.textContent).toContain('tardó demasiado');
  });

  it('"Usar mi ubicación" → backend (POST, sin guardar coordenadas) → dirección + "Barrio detectado"', async () => {
    const { el, fixture, store, http } = await render({
      enabled: true,
      geo: { current: () => Promise.resolve({ lat: -37.3211, lng: -59.1401 }) },
    });
    buttonByText(el, 'Usar mi ubicación')!.click();
    await settle(fixture);
    const req = http.expectOne(`${API}/location/reverse`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ lat: -37.3211, lng: -59.1401 });
    req.flush({ result: { address: 'Gral. Paz 1234', formattedAddress: 'Gral. Paz 1234, Tandil', zone: { id: ZONES[1].id, name: 'Villa Italia' }, outsideCity: false } });
    await settle(fixture);
    expect(store.exactAddress()).toBe('Gral. Paz 1234');
    expect(store.draft().zone?.id).toBe(ZONES[1].id);
    expect(el.querySelector('[data-testid="zone-summary"]')?.textContent).toContain('Barrio detectado');
    TestBed.tick();
    const persisted = JSON.stringify(sessionStorage);
    expect(persisted).not.toContain('-37.32');
    expect(persisted).not.toContain('Gral. Paz');
  });

  it('el proveedor no reconoce el barrio → "No pudimos identificar el barrio" y lista para elegir', async () => {
    const { el, fixture, store, http } = await render({
      enabled: true,
      geo: { current: () => Promise.resolve({ lat: -37.3, lng: -59.1 }) },
    });
    buttonByText(el, 'Usar mi ubicación')!.click();
    await settle(fixture);
    http.expectOne(`${API}/location/reverse`).flush({ result: { address: 'Ruta 226 km 160', formattedAddress: 'Ruta 226', zone: null, outsideCity: false } });
    await settle(fixture);
    expect(store.draft().zone).toBeNull();
    expect(el.textContent).toContain('No pudimos identificar el barrio.');
    expect(el.textContent).toContain('Elegí el más cercano');
  });

  it('falla del proveedor → se sigue a mano', async () => {
    const { el, fixture, http } = await render({
      enabled: true,
      geo: { current: () => Promise.resolve({ lat: -37.3, lng: -59.1 }) },
    });
    buttonByText(el, 'Usar mi ubicación')!.click();
    await settle(fixture);
    http.expectOne(`${API}/location/reverse`).flush({ code: 'LOCATION_PROVIDER_ERROR' }, { status: 502, statusText: 'Bad Gateway' });
    await settle(fixture);
    expect(el.querySelector('[data-testid="locate-message"]')?.textContent).toContain('Escribila a mano');
    expect(el.querySelector('#t-address')).toBeTruthy();
  });

  it('autocompletar (combobox): sugerencias del backend, teclado y barrio detectado', async () => {
    const { el, fixture, store, http } = await render({ enabled: true });
    const input = el.querySelector<HTMLInputElement>('#t-address')!;
    expect(input.getAttribute('role')).toBe('combobox');
    type(el, 'Alem 4');
    await new Promise((r) => setTimeout(r, 350));
    const req = http.expectOne(`${API}/location/autocomplete`);
    expect(req.request.body.query).toBe('Alem 4');
    req.flush({ items: [{ id: 'p1', main: 'Alem 455', secondary: 'Tandil, Buenos Aires' }] });
    await settle(fixture);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelectorAll('[role="option"]').length).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await settle(fixture);
    expect(input.getAttribute('aria-activedescendant')).toBe('t-opt-0');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);
    const resolve = http.expectOne(`${API}/location/resolve`);
    expect(resolve.request.body.placeId).toBe('p1');
    resolve.flush({ result: { address: 'Alem 455', formattedAddress: 'Alem 455, Tandil', zone: { id: ZONES[0].id, name: 'Centro' }, outsideCity: false } });
    await settle(fixture);
    expect(store.exactAddress()).toBe('Alem 455');
    expect(store.draft().zone?.name).toBe('Centro');
  });
});

describe('Una sola UX de ubicación', () => {
  it('"Crear solicitud" (paso 2) y "Solicitar presupuesto" usan el mismo WorkLocationPicker', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: API }],
    });
    const store = TestBed.inject(RequestStore);
    store.goToStep(2);
    const flow = TestBed.createComponent(RequestFlowPage);
    flow.detectChanges();
    const quote = TestBed.createComponent(QuoteRequestPage);
    quote.detectChanges();
    const count = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelectorAll('app-work-location-picker').length;
    expect(count(flow)).toBeGreaterThan(0);
    expect(count(quote)).toBeGreaterThan(0);
    // Ninguna de las dos arma su propio selector de barrios.
    expect(flow.nativeElement.querySelectorAll('[role="radiogroup"][aria-label="Barrio"]').length).toBe(0);
    TestBed.inject(HttpTestingController).match(() => true);
  });
});
