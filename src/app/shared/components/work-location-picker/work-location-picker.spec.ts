import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { Zone } from '../../../core/models/category';
import { GeolocationService } from '../../../core/services/geolocation.service';
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

type MapsConfig = { enabled: boolean; mapApiKey?: string | null };
async function render(opts: { config?: MapsConfig; geo?: { supported: boolean; current: () => Promise<{ lat: number; lng: number }> } }) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: API_URL, useValue: API },
      { provide: GeolocationService, useValue: opts.geo ?? { supported: false, current: () => Promise.resolve({ lat: -37.3, lng: -59.1 }) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  http.expectOne(`${API}/zones?city=tandil`).flush(ZONES);
  http.expectOne(`${API}/location/config`).flush(opts.config ?? { enabled: true, mapApiKey: null });
  await settle(fixture);
  return { http, fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(RequestStore) };
}

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    address: 'Quintana 860',
    formattedAddress: 'Quintana 860, Tandil, Buenos Aires, Argentina',
    zone: { id: ZONES[0].id, name: ZONES[0].name },
    outsideCity: false,
    cityVerified: true,
    latitude: -37.3211,
    longitude: -59.1401,
    providerPlaceId: 'test-place-id',
    ...overrides,
  };
}

const typeAddress = (el: HTMLElement, value: string) => {
  const input = el.querySelector<HTMLInputElement>('#t-address')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
};
const buttonByText = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim().includes(text));
const selectSuggestion = (el: HTMLElement) => {
  el.querySelector('[role="option"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
};

afterEach(() => {
  TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true });
  delete (window as Window & { google?: unknown }).google;
});

describe('WorkLocationPicker · Fase 2.5B', () => {
  it('espera 3 caracteres y usa debounce; selecciona sugerencia con teclado pero exige confirmación explícita', async () => {
    const { el, fixture, http, store } = await render({});
    const input = typeAddress(el, 'Qu');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectNone(`${API}/location/autocomplete`);

    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const autocomplete = http.expectOne(`${API}/location/autocomplete`);
    expect(autocomplete.request.body.query).toBe('Quintana 860');
    autocomplete.flush({ items: [{ id: 'place-q860', main: 'Quintana 860', secondary: 'Tandil, Buenos Aires' }] });
    await settle(fixture);
    expect(input.getAttribute('role')).toBe('combobox');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await settle(fixture);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);

    const resolve = http.expectOne(`${API}/location/resolve`);
    expect(resolve.request.body.placeId).toBe('place-q860');
    resolve.flush({ result: resolved() });
    await settle(fixture);
    expect(el.querySelector('[data-testid="outside-city"]')).toBeNull();
    expect(store.draft().location).toBeNull();
    expect(buttonByText(el, 'Confirmar ubicación')).toBeTruthy();
    buttonByText(el, 'Confirmar ubicación')!.click();
    await settle(fixture);
    expect(store.draft().location).toMatchObject({ latitude: -37.3211, longitude: -59.1401, address: 'Quintana 860' });
  });

  it('rechaza ubicación fuera de Tandil y no permite confirmarla', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Corrientes 100');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ items: [{ id: 'outside', main: 'Corrientes 100', secondary: 'Buenos Aires, Argentina' }] });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved({ address: 'Corrientes 100', formattedAddress: 'Corrientes 100, Buenos Aires, Argentina', zone: null, outsideCity: true, cityVerified: false }) });
    await settle(fixture);
    expect(el.querySelector('[data-testid="outside-city"]')?.textContent).toContain('disponible en Tandil');
    expect(buttonByText(el, 'Confirmar ubicación')).toBeUndefined();
    expect(store.draft().location).toBeNull();
  });

  it('limpia la zona inferida anterior cuando el cliente cambia la dirección', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ items: [{ id: 'q860', main: 'Quintana 860', secondary: 'Tandil' }] });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved() });
    await settle(fixture);
    expect(store.draft().zone?.id).toBe(ZONES[0].id);

    typeAddress(el, 'Sarmiento 1200');
    expect(store.draft().zone).toBeNull();
  });

  it('permite continuar sin mapa solo como fallback visual con una dirección y coordenadas ya verificadas', async () => {
    const { el, fixture, http, store } = await render({ config: { enabled: true, mapApiKey: null } });
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ items: [{ id: 'q860', main: 'Quintana 860', secondary: 'Tandil' }] });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved() });
    await settle(fixture);
    expect(el.textContent).toContain('No pudimos cargar el mapa');
    buttonByText(el, 'Confirmar ubicación')!.click();
    await settle(fixture);
    expect(store.draft().location?.latitude).toBe(-37.3211);
  });

  it('permite mover el pin con un toque; vuelve a geocodificar y pide confirmar de nuevo', async () => {
    let map: FakeGoogleMap | undefined;
    class FakeGoogleMap {
      listeners = new Map<string, (event: { latLng?: { lat(): number; lng(): number } }) => void>();
      constructor(_host: HTMLElement, _options: Record<string, unknown>) { map = this; }
      addListener(name: string, callback: (event: { latLng?: { lat(): number; lng(): number } }) => void) {
        this.listeners.set(name, callback);
        return { remove: () => this.listeners.delete(name) };
      }
      panTo() {}
    }
    class FakeGoogleMarker {
      position?: { lat(): number; lng(): number };
      constructor(_options: unknown) {}
      setMap() {}
      setPosition() {}
      getPosition() { return this.position; }
      addListener() { return { remove() {} }; }
    }
    (window as Window & { google?: unknown }).google = { maps: { Map: FakeGoogleMap, Marker: FakeGoogleMarker } };
    const { el, fixture, http, store } = await render({ config: { enabled: true, mapApiKey: 'restricted-browser-key' } });
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ items: [{ id: 'q860', main: 'Quintana 860', secondary: 'Tandil' }] });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved() });
    await settle(fixture);
    expect(map).toBeTruthy();
    map!.listeners.get('click')!({ latLng: { lat: () => -37.322, lng: () => -59.141 } });
    const reverse = http.expectOne(`${API}/location/reverse`);
    expect(reverse.request.body).toEqual({ lat: -37.322, lng: -59.141 });
    reverse.flush({ result: resolved({ address: 'Quintana 900', formattedAddress: 'Quintana 900, Tandil', latitude: -37.322, longitude: -59.141 }) });
    await settle(fixture);
    expect(el.querySelector<HTMLInputElement>('#t-address')?.value).toBe('Quintana 900');
    expect(store.draft().location).toBeNull();
    expect(buttonByText(el, 'Confirmar ubicación')).toBeTruthy();
  });

  it('guarda tipo de propiedad y piso/unidad opcionales solo en departamento', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ items: [{ id: 'q860', main: 'Quintana 860', secondary: 'Tandil' }] });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved() });
    await settle(fixture);
    buttonByText(el, 'Confirmar ubicación')!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="false"]')!.click();
    // Selecciona Departamento por nombre, sin depender del orden de la UI.
    buttonByText(el, 'Departamento')!.click();
    await settle(fixture);
    const floor = el.querySelector<HTMLInputElement>('#t-floor')!;
    floor.value = '3'; floor.dispatchEvent(new Event('input'));
    const unit = el.querySelector<HTMLInputElement>('#t-unit')!;
    unit.value = 'B'; unit.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(store.draft().location).toMatchObject({ propertyType: 'APARTMENT', floor: '3', unit: 'B' });
    buttonByText(el, 'Otro')!.click();
    await settle(fixture);
    expect(store.draft().location).toMatchObject({ propertyType: 'OTHER', floor: null, unit: null });
  });

  it('muestra un error recuperable cuando falla autocomplete; la dirección libre no queda confirmable', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http.expectOne(`${API}/location/autocomplete`).flush({ code: 'LOCATION_PROVIDER_ERROR' }, { status: 502, statusText: 'Bad Gateway' });
    await settle(fixture);
    expect(el.textContent).toContain('No pudimos buscar direcciones ahora');
    expect(buttonByText(el, 'Confirmar ubicación')).toBeUndefined();
    expect(store.draft().location).toBeNull();
  });
});

describe('Una sola UX de ubicación', () => {
  it('Crear solicitud y Solicitar presupuesto usan el mismo WorkLocationPicker', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: API }] });
    const store = TestBed.inject(RequestStore);
    store.goToStep(2);
    const flow = TestBed.createComponent(RequestFlowPage);
    flow.detectChanges();
    const quote = TestBed.createComponent(QuoteRequestPage);
    quote.detectChanges();
    const count = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.querySelectorAll('app-work-location-picker').length;
    expect(count(flow)).toBeGreaterThan(0);
    expect(count(quote)).toBeGreaterThan(0);
    TestBed.inject(HttpTestingController).match(() => true);
  });
});
