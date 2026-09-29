import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { API_URL } from '../../../core/api/api.config';
import { Zone } from '../../../core/models/category';
import { GeolocationService } from '../../../core/services/geolocation.service';
import { RequestStore } from '../../../core/state/request.store';
import { QuoteRequestPage } from '../../../features/client/quote-request/quote-request-page';
import { RequestFlowPage } from '../../../features/client/request-flow/request-flow-page';
import { WorkLocationPicker } from './work-location-picker';

const mapLibreState = vi.hoisted(() => ({
  map: undefined as unknown,
  marker: undefined as unknown,
  resizeCalls: 0,
}));
vi.mock('maplibre-gl', () => {
  class FakeMap {
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    readonly onceHandlers = new Map<string, () => void>();
    constructor(readonly options: Record<string, unknown>) {
      mapLibreState.map = this;
    }
    addControl() {
      return this;
    }
    once(name: string, callback: () => void) {
      this.onceHandlers.set(name, callback);
      return this;
    }
    on(name: string, callback: (...args: unknown[]) => void) {
      this.handlers.set(name, callback);
      return this;
    }
    off(name: string) {
      this.handlers.delete(name);
      return this;
    }
    easeTo() {
      return this;
    }
    isStyleLoaded() {
      return false;
    }
    resize() {
      mapLibreState.resizeCalls++;
      return this;
    }
    fireOnce(name: string) {
      const callback = this.onceHandlers.get(name);
      this.onceHandlers.delete(name);
      callback?.();
    }
    remove() {
      return this;
    }
  }
  class FakeMarker {
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    private point: [number, number] = [0, 0];
    constructor(readonly options: Record<string, unknown>) {
      mapLibreState.marker = this;
    }
    setLngLat(point: [number, number]) {
      this.point = point;
      return this;
    }
    addTo() {
      return this;
    }
    getLngLat() {
      return { lng: this.point[0], lat: this.point[1] };
    }
    on(name: string, callback: (...args: unknown[]) => void) {
      this.handlers.set(name, callback);
      return this;
    }
    off(name: string) {
      this.handlers.delete(name);
      return this;
    }
    remove() {
      return this;
    }
  }
  class FakeNavigationControl {}
  return { Map: FakeMap, Marker: FakeMarker, NavigationControl: FakeNavigationControl };
});

const API = 'http://api.test/api/v1';
const ZONES: Zone[] = [
  { id: '11111111-1111-4111-8111-000000000001', name: 'Centro', slug: 'centro', cityId: 'c' },
  {
    id: '11111111-1111-4111-8111-000000000002',
    name: 'Villa Italia',
    slug: 'villa-italia',
    cityId: 'c',
  },
  { id: '11111111-1111-4111-8111-000000000003', name: 'Uncas', slug: 'uncas', cityId: 'c' },
];

@Component({ imports: [WorkLocationPicker], template: `<app-work-location-picker idPrefix="t" />` })
class Host {}

type MapsConfig = { enabled: boolean; mapApiKey?: string | null };
async function render(opts: {
  config?: MapsConfig;
  geo?: { supported: boolean; current: () => Promise<{ lat: number; lng: number }> };
}) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: API },
      {
        provide: GeolocationService,
        useValue: opts.geo ?? {
          supported: false,
          current: () => Promise.resolve({ lat: -37.3, lng: -59.1 }),
        },
      },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  http.expectOne(`${API}/zones?city=tandil`).flush(ZONES);
  http.expectOne(`${API}/location/config`).flush(opts.config ?? { enabled: true, mapApiKey: null });
  await settle(fixture);
  return {
    http,
    fixture,
    el: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(RequestStore),
  };
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
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.trim().includes(text),
  );
const selectSuggestion = (el: HTMLElement) => {
  el.querySelector('[role="option"]')!.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true }),
  );
};

async function selectResolvedLocation(
  resultOverrides: Record<string, unknown> = {},
  afterResolvedRender?: (root: HTMLElement) => void,
) {
  const context = await render({
    config: { enabled: true, mapApiKey: 'restricted-browser-key' },
  });
  typeAddress(context.el, 'Quintana 860');
  await new Promise((resolve) => setTimeout(resolve, 350));
  context.http.expectOne(`${API}/location/autocomplete`).flush({
    items: [
      {
        id: 'q860',
        main: 'Quintana 860',
        secondary: 'Tandil',
        address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
      },
    ],
  });
  await settle(context.fixture);
  selectSuggestion(context.el);
  await settle(context.fixture);
  context.http
    .expectOne(`${API}/location/resolve`)
    .flush({ result: resolved(resultOverrides) });
  context.fixture.detectChanges();
  afterResolvedRender?.(context.el);
  await settle(context.fixture);
  return context;
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true });
  vi.unstubAllGlobals();
  mapLibreState.map = undefined;
  mapLibreState.marker = undefined;
  mapLibreState.resizeCalls = 0;
  document.head.querySelector('link[data-maplibre-styles]')?.remove();
  document.head.querySelector('style[data-maplibre-controls]')?.remove();
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
    autocomplete.flush({
      items: [
        {
          id: 'place-q860',
          main: 'Quintana 860',
          secondary: 'Tandil, Buenos Aires',
          address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
        },
      ],
    });
    await settle(fixture);
    expect(input.getAttribute('role')).toBe('combobox');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await settle(fixture);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);

    const resolve = http.expectOne(`${API}/location/resolve`);
    expect(resolve.request.body.placeId).toBe('p1');
    expect(resolve.request.body.selectedAddress).toBe('Alem 455');
    resolve.flush({
      result: {
        address: 'Alem 455',
        formattedAddress: 'Alem 455, Tandil',
        zone: { id: ZONES[0].id, name: 'Centro' },
        outsideCity: false,
      },
    });
    await settle(fixture);
    expect(el.querySelector('[data-testid="outside-city"]')).toBeNull();
    expect(store.draft().location).toBeNull();
    expect(buttonByText(el, 'Confirmar ubicación')).toBeTruthy();
    buttonByText(el, 'Confirmar ubicación')!.click();
    await settle(fixture);
    expect(store.draft().location).toMatchObject({
      latitude: -37.3211,
      longitude: -59.1401,
      address: 'Quintana 860',
    });
  });

  it('rechaza ubicación fuera de Tandil y no permite confirmarla', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Corrientes 100');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({
        items: [
          {
            id: 'outside',
            main: 'Corrientes 100',
            secondary: 'Buenos Aires, Argentina',
            address: 'Corrientes 100, Buenos Aires, Argentina',
          },
        ],
      });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http
      .expectOne(`${API}/location/resolve`)
      .flush({
        result: resolved({
          address: 'Corrientes 100',
          formattedAddress: 'Corrientes 100, Buenos Aires, Argentina',
          zone: null,
          outsideCity: true,
          cityVerified: false,
        }),
      });
    await settle(fixture);
    expect(el.querySelector('[data-testid="outside-city"]')?.textContent).toContain(
      'disponible en Tandil',
    );
    expect(buttonByText(el, 'Confirmar ubicación')).toBeUndefined();
    expect(store.draft().location).toBeNull();
  });

  it('limpia la zona inferida anterior cuando el cliente cambia la dirección', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({
        items: [
          {
            id: 'q860',
            main: 'Quintana 860',
            secondary: 'Tandil',
            address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
          },
        ],
      });
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
    const { el, fixture, http, store } = await render({
      config: { enabled: true, mapApiKey: null },
    });
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({
        items: [
          {
            id: 'q860',
            main: 'Quintana 860',
            secondary: 'Tandil',
            address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
          },
        ],
      });
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

  it.each(['load', 'idle'] as const)(
    'limpia el estado Cargando mapa cuando MapLibre emite %s y actualiza la vista Angular',
    async (readyEvent) => {
      const { el } = await selectResolvedLocation({
        latitude: -37.30512115,
        longitude: -59.14575585,
      });
      const map = mapLibreState.map as {
        options: Record<string, unknown>;
        onceHandlers: Map<string, () => void>;
        fireOnce(name: string): void;
      };

      expect(el.textContent).toContain('Cargando mapa');
      expect(map.onceHandlers.has('load')).toBe(true);
      expect(map.onceHandlers.has('idle')).toBe(true);
      expect(map.options['center']).toEqual([-59.14575585, -37.30512115]);
      map.fireOnce(readyEvent);
      expect(el.textContent).not.toContain('Cargando mapa');
    },
  );

  it('resizea el mapa cuando el contenedor adquiere dimensiones visibles', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class FakeResizeObserver {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
          this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
      },
    );

    const { el } = await selectResolvedLocation({}, (root) => {
      const host = root.querySelector<HTMLDivElement>('[role="application"]')!;
      vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 360,
        height: 230,
        top: 0,
        right: 360,
        bottom: 230,
        left: 0,
        toJSON: () => ({}),
      });
    });

    expect(el.querySelector('[role="application"]')).toBeTruthy();
    expect(mapLibreState.resizeCalls).toBeGreaterThan(0);
  });

  it('permite mover el pin con un toque; vuelve a geocodificar y pide confirmar de nuevo', async () => {
    const { el, fixture, http, store } = await render({
      config: { enabled: true, mapApiKey: 'restricted-browser-key' },
    });
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({
        items: [
          {
            id: 'q860',
            main: 'Quintana 860',
            secondary: 'Tandil',
            address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
          },
        ],
      });
    await settle(fixture);
    selectSuggestion(el);
    await settle(fixture);
    http.expectOne(`${API}/location/resolve`).flush({ result: resolved() });
    await settle(fixture);
    const map = mapLibreState.map as {
      options: Record<string, unknown>;
      handlers: Map<string, (event: { lngLat: { lat: number; lng: number } }) => void>;
    };
    expect(map).toBeTruthy();
    expect(map.options['style']).toContain('maps.geoapify.com/v1/styles/osm-bright/style.json');
    expect(map.options['attributionControl']).toEqual({ compact: false });
    expect(
      document.head.querySelector('link[data-maplibre-styles]')?.getAttribute('href'),
    ).toContain('/assets/maplibre-gl.css');
    map.handlers.get('click')!({ lngLat: { lat: -37.322, lng: -59.141 } });
    const reverse = http.expectOne(`${API}/location/reverse`);
    expect(reverse.request.body).toEqual({ lat: -37.322, lng: -59.141 });
    reverse.flush({
      result: resolved({
        address: 'Quintana 900',
        formattedAddress: 'Quintana 900, Tandil',
        latitude: -37.322,
        longitude: -59.141,
      }),
    });
    await settle(fixture);
    expect(el.querySelector<HTMLInputElement>('#t-address')?.value).toBe('Quintana 900');
    expect(store.draft().location).toBeNull();
    const marker = mapLibreState.marker as {
      handlers: Map<string, () => void>;
      setLngLat(point: [number, number]): unknown;
      getLngLat(): { lat: number; lng: number };
    };
    marker.setLngLat([-59.142, -37.323]);
    marker.handlers.get('dragend')!();
    const dragged = http.expectOne(`${API}/location/reverse`);
    expect(dragged.request.body).toEqual({ lat: -37.323, lng: -59.142 });
    dragged.flush({
      result: resolved({ address: 'Quintana 910', latitude: -37.323, longitude: -59.142 }),
    });
    await settle(fixture);
    expect(el.querySelector<HTMLInputElement>('#t-address')?.value).toBe('Quintana 910');
    map.handlers.get('click')!({ lngLat: { lat: -37.324, lng: -59.143 } });
    http.expectOne(`${API}/location/reverse`).flush({ result: null });
    await settle(fixture);
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'No encontramos una dirección para ese punto',
    );
    expect(marker.getLngLat()).toEqual({ lat: -37.323, lng: -59.142 });
    map.handlers.get('click')!({ lngLat: { lat: -37.325, lng: -59.144 } });
    http
      .expectOne(`${API}/location/reverse`)
      .flush({ code: 'LOCATION_PROVIDER_ERROR' }, { status: 502, statusText: 'Bad Gateway' });
    await settle(fixture);
    expect(el.querySelector('[role="status"]')?.textContent).toContain(
      'No pudimos verificar ese punto',
    );
    expect(buttonByText(el, 'Confirmar ubicación')).toBeTruthy();
  });

  it('guarda tipo de propiedad y piso/unidad opcionales solo en departamento', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({
        items: [
          {
            id: 'q860',
            main: 'Quintana 860',
            secondary: 'Tandil',
            address: 'Quintana 860, Tandil, Buenos Aires, Argentina',
          },
        ],
      });
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
    floor.value = '3';
    floor.dispatchEvent(new Event('input'));
    const unit = el.querySelector<HTMLInputElement>('#t-unit')!;
    unit.value = 'B';
    unit.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(store.draft().location).toMatchObject({
      propertyType: 'APARTMENT',
      floor: '3',
      unit: 'B',
    });
    buttonByText(el, 'Otro')!.click();
    await settle(fixture);
    expect(store.draft().location).toMatchObject({
      propertyType: 'OTHER',
      floor: null,
      unit: null,
    });
  });

  it('muestra un error recuperable cuando falla autocomplete; la dirección libre no queda confirmable', async () => {
    const { el, fixture, http, store } = await render({});
    typeAddress(el, 'Quintana 860');
    await new Promise((resolve) => setTimeout(resolve, 350));
    http
      .expectOne(`${API}/location/autocomplete`)
      .flush({ code: 'LOCATION_PROVIDER_ERROR' }, { status: 502, statusText: 'Bad Gateway' });
    await settle(fixture);
    expect(el.textContent).toContain('No pudimos buscar direcciones ahora');
    expect(buttonByText(el, 'Confirmar ubicación')).toBeUndefined();
    expect(store.draft().location).toBeNull();
  });
});

describe('Una sola UX de ubicación', () => {
  it('Crear solicitud y Solicitar presupuesto usan el mismo WorkLocationPicker', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_URL, useValue: API },
      ],
    });
    const store = TestBed.inject(RequestStore);
    store.goToStep(2);
    const flow = TestBed.createComponent(RequestFlowPage);
    flow.detectChanges();
    const quote = TestBed.createComponent(QuoteRequestPage);
    quote.detectChanges();
    const count = (fixture: { nativeElement: HTMLElement }) =>
      fixture.nativeElement.querySelectorAll('app-work-location-picker').length;
    expect(count(flow)).toBeGreaterThan(0);
    expect(count(quote)).toBeGreaterThan(0);
    TestBed.inject(HttpTestingController).match(() => true);
  });
});
