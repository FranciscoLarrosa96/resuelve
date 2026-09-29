import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import type { Map as MapLibreMap, MapMouseEvent, Marker as MapLibreMarker } from 'maplibre-gl';
import { LocationApiService } from '../../../core/api/location-api.service';
import { AddressSuggestion, ResolvedLocation } from '../../../core/models/location';
import { REQUEST_LIMITS } from '../../../core/models/request';
import {
  ConfirmedRequestLocation,
  PropertyType,
  ZoneRef,
} from '../../../core/models/service-request';
import { GeolocationError, GeolocationService } from '../../../core/services/geolocation.service';
import { LocationStore } from '../../../core/state/location.store';
import { RequestStore } from '../../../core/state/request.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { ChipDirective } from '../../directives/chip.directive';
import { Icon } from '../icon/icon';

type LocateState =
  'idle' | 'locating' | 'denied' | 'timeout' | 'unavailable' | 'provider-error' | 'not-found';

function ensureMapLibreStyles(): void {
  if (document.querySelector('link[data-maplibre-styles]')) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('assets/maplibre-gl.css', document.baseURI).toString();
  stylesheet.dataset['maplibreStyles'] = 'true';
  document.head.append(stylesheet);
  const controlStyles = document.createElement('style');
  controlStyles.dataset['maplibreControls'] = 'true';
  controlStyles.textContent = `
    .maplibregl-ctrl-group {
      overflow: hidden;
      border: 1px solid rgb(221 225 218 / 92%);
      border-radius: .75rem;
      box-shadow: 0 2px 8px rgb(23 33 24 / 14%);
    }
    .maplibregl-ctrl button { width: 40px; height: 40px; }
    .maplibregl-ctrl-attrib { font-size: 10px; }
  `;
  document.head.append(controlStyles);
}

const LOCATE_MESSAGES: Partial<Record<LocateState, string>> = {
  denied:
    'No tenemos permiso para usar tu ubicación. Buscá la dirección escribiendo calle y número.',
  timeout: 'Tu ubicación tardó demasiado. Buscá la dirección escribiendo calle y número.',
  unavailable: 'No pudimos obtener tu ubicación. Buscá la dirección escribiendo calle y número.',
  'provider-error': 'No pudimos buscar la dirección ahora. Reintentá en un momento.',
  'not-found': 'No encontramos una dirección para ese punto. Buscá calle y número.',
};

/**
 * Búsqueda y confirmación de la ubicación precisa. La API propia usa Geoapify
 * y verifica Tandil; MapLibre y sus tiles se cargan bajo demanda.
 */
@Component({
  selector: 'app-work-location-picker',
  imports: [ChipDirective, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'work-location-picker' },
  template: `
    <h3 class="text-[15px] font-semibold text-ink">¿Dónde necesitás el trabajo?</h3>
    <p class="mt-1 text-[13.5px] leading-[1.45] text-muted">
      Ingresá la dirección donde se realizará el trabajo.
    </p>

    @if (location.enabled() && geo.supported) {
      <button
        type="button"
        class="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand bg-surface px-4 text-sm font-semibold text-brand hover:bg-brand-tint disabled:opacity-60 press"
        [disabled]="disabled() || locate() === 'locating'"
        (click)="useMyLocation()"
      >
        @if (locate() === 'locating') {
          <span
            class="size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
            aria-hidden="true"
          ></span
          >Buscando…
        } @else {
          <app-icon name="locate" [size]="16" />Usar mi ubicación una vez
        }
      </button>
      @if (locateMessage(); as m) {
        <p class="mt-2 text-[13px] text-ink-soft" role="status" data-testid="locate-message">
          {{ m }}
        </p>
      }
    }

    <label [for]="id('address')" class="mt-3 block text-[14px] font-semibold"
      >Buscar dirección en Tandil</label
    >
    <div class="relative mt-1.5">
      <input
        [id]="id('address')"
        #addressInput
        type="text"
        autocomplete="street-address"
        [attr.maxlength]="limits.addressMax"
        placeholder="Ej. Quintana 860"
        class="h-12.5 w-full rounded-xl border-[1.5px] border-line-input bg-surface px-3.5 text-[15.5px] text-ink outline-none focus:border-brand disabled:opacity-60"
        [attr.role]="location.enabled() ? 'combobox' : null"
        [attr.aria-autocomplete]="location.enabled() ? 'list' : null"
        [attr.aria-expanded]="location.enabled() ? showSuggestions() : null"
        [attr.aria-controls]="location.enabled() ? id('suggestions') : null"
        [attr.aria-activedescendant]="activeIndex() >= 0 ? id('opt-' + activeIndex()) : null"
        [attr.aria-describedby]="id('address-hint')"
        [value]="inputAddress()"
        [disabled]="disabled()"
        (input)="onAddress($event)"
        (keydown)="onKey($event)"
        (blur)="closeSoon()"
      />
      @if (searching()) {
        <span
          class="absolute top-4 right-3 size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
          aria-label="Buscando direcciones"
        ></span>
      }
      @if (showSuggestions()) {
        <ul
          [id]="id('suggestions')"
          role="listbox"
          aria-label="Direcciones sugeridas"
          class="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-float"
        >
          @for (s of suggestions(); track s.id; let i = $index) {
            <li
              [id]="id('opt-' + i)"
              role="option"
              [attr.aria-selected]="activeIndex() === i"
              class="cursor-pointer px-3.5 py-2.5"
              [class.bg-brand-tint]="activeIndex() === i"
              (mousedown)="$event.preventDefault(); pick(s)"
            >
              <span class="block text-[14.5px] font-semibold text-ink">{{ s.main }}</span>
              @if (s.secondary) {
                <span class="mt-0.5 block text-[12.5px] text-muted">{{ s.secondary }}</span>
              }
            </li>
          }
        </ul>
      }
    </div>
    <p [id]="id('address-hint')" class="mt-1.5 flex gap-2 text-[12.5px] leading-[1.45] text-muted">
      <app-icon name="lock" class="mt-px shrink-0" [size]="13" />
      La dirección exacta no se comparte con profesionales hasta que aceptes un presupuesto. La
      ubicación confirmada queda en esta pestaña por hasta 12 horas mientras armás el pedido.
    </p>
    @if (autocompleteError()) {
      <p class="mt-2 text-[13px] text-accent-ink" role="alert">
        No pudimos buscar direcciones ahora.
        <button type="button" class="font-semibold underline" (click)="retrySearch()">
          Reintentar
        </button>
      </p>
    }
    @if (!location.enabled()) {
      <p class="mt-2 text-[13px] text-accent-ink" role="status">
        La búsqueda de direcciones no está configurada en este entorno. No se puede confirmar una
        ubicación manual sin validar sus coordenadas.
      </p>
    }

    @if (selected(); as place) {
      <section
        class="mt-4 overflow-hidden rounded-2xl border border-line bg-surface"
        aria-label="Ubicación seleccionada"
      >
        <div class="relative h-[230px] overflow-hidden bg-sand-light sm:h-[280px]">
          <div
            #mapHost
            class="absolute inset-0"
            role="application"
            aria-label="Mapa. Tocá o hacé clic en el punto correcto para ajustar la ubicación."
          ></div>
          @if (mapLoading()) {
            <div
              class="absolute inset-0 grid place-items-center bg-sand-light/80"
              aria-hidden="true"
            >
              <div
                class="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-muted shadow-card"
              >
                <span
                  class="size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
                ></span
                >Cargando mapa…
              </div>
            </div>
          }
          @if (mapError()) {
            <div
              class="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 p-3 text-[12.5px] shadow-card"
              role="status"
            >
              <span
                >No pudimos cargar el mapa. La dirección validada todavía se puede confirmar.</span
              >
              <button
                type="button"
                class="shrink-0 font-semibold text-brand underline"
                (click)="retryMap()"
              >
                Reintentar
              </button>
            </div>
          }
        </div>
        @if (mapAdjustError(); as error) {
          <p class="px-3.5 pt-3 text-[13px] text-accent-ink" role="status">
            {{
              error === 'not-found'
                ? 'No encontramos una dirección para ese punto; el pin volvió a la ubicación anterior.'
                : 'No pudimos verificar ese punto. El pin volvió a la ubicación anterior; reintentá.'
            }}
          </p>
        }
        <div class="p-3.5 sm:p-4">
          <p class="text-[15px] font-semibold text-ink">{{ place.address }}</p>
          <p class="mt-0.5 text-[13px] text-muted">{{ place.formattedAddress }}</p>
          <p class="mt-2 text-[12.5px] text-muted">
            También podés ajustar la ubicación tocando el mapa para mover el pin.
          </p>
          @if (!place.cityVerified || place.outsideCity) {
            <p
              class="mt-3 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent-ink"
              role="alert"
              data-testid="outside-city"
            >
              Por ahora Resuelve está disponible en Tandil. Elegí una dirección dentro de la ciudad
              para continuar.
            </p>
          } @else if (adjustingMap()) {
            <p class="mt-3 text-[13px] text-muted" role="status">Verificando el nuevo punto…</p>
          } @else if (!confirmedLocation()) {
            <button
              type="button"
              class="mt-3 h-11.5 w-full rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-55 press"
              [disabled]="disabled() || adjustingMap()"
              (click)="confirmLocation()"
            >
              Confirmar ubicación
            </button>
          } @else {
            <div
              class="mt-3 flex items-center justify-between gap-3 rounded-xl bg-brand-tint px-3 py-2.5"
              role="status"
              data-testid="location-confirmed"
            >
              <span class="flex items-center gap-2 text-[13px] font-semibold text-brand"
                ><app-icon name="check" [size]="15" />Ubicación confirmada</span
              >
              <button
                type="button"
                class="text-[13px] font-semibold text-brand underline"
                [disabled]="disabled()"
                (click)="changeLocation()"
              >
                Cambiar
              </button>
            </div>
          }
        </div>
      </section>
    }

    @if (confirmedLocation(); as confirmed) {
      <fieldset class="mt-4" [disabled]="disabled()">
        <legend class="text-[14px] font-semibold text-ink">¿Qué tipo de propiedad es?</legend>
        <div class="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de propiedad">
          @for (option of propertyOptions; track option.value) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="confirmed.propertyType === option.value"
              [class]="
                confirmed.propertyType === option.value
                  ? 'rounded-xl border-[1.5px] border-brand bg-brand-tint px-2 py-3 text-[13.5px] font-semibold text-brand'
                  : 'rounded-xl border border-line-input bg-surface px-2 py-3 text-[13.5px] font-medium text-ink-soft hover:bg-sand-light'
              "
              (click)="chooseProperty(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (confirmed.propertyType === 'APARTMENT') {
          <div class="mt-3 grid grid-cols-2 gap-3">
            <label class="text-[13px] font-medium text-muted" [for]="id('floor')"
              >Piso <span class="font-normal">(opcional)</span>
              <input
                [id]="id('floor')"
                type="text"
                maxlength="40"
                autocomplete="off"
                [value]="confirmed.floor ?? ''"
                class="mt-1.5 h-11 w-full rounded-xl border border-line-input bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand"
                (input)="onApartmentDetails($event, 'floor')"
              />
            </label>
            <label class="text-[13px] font-medium text-muted" [for]="id('unit')"
              >Departamento / unidad <span class="font-normal">(opcional)</span>
              <input
                [id]="id('unit')"
                type="text"
                maxlength="80"
                autocomplete="off"
                [value]="confirmed.unit ?? ''"
                class="mt-1.5 h-11 w-full rounded-xl border border-line-input bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand"
                (input)="onApartmentDetails($event, 'unit')"
              />
            </label>
          </div>
        }
        <p class="mt-2 flex gap-1.5 text-[12px] text-muted">
          <app-icon name="lock" [size]="12" />El tipo y los datos de acceso son privados para vos y,
          después de aceptar, para el profesional elegido.
        </p>
      </fieldset>
    }

    <div class="mt-4 border-t border-line-soft pt-3.5">
      @if (zones.error()) {
        <div class="flex items-center gap-3 text-sm text-muted" role="alert">
          No pudimos cargar los barrios.<button
            type="button"
            class="font-semibold text-brand underline"
            (click)="zones.load()"
          >
            Reintentar
          </button>
        </div>
      } @else if (!zones.loaded()) {
        <div class="flex flex-wrap gap-2" aria-hidden="true">
          @for (s of [1, 2, 3, 4]; track s) {
            <span class="shimmer h-10 w-24 rounded-full"></span>
          }
        </div>
        <span class="sr-only" role="status">Cargando barrios…</span>
      } @else if (zone() && !changingZone()) {
        <div class="flex items-center gap-3" data-testid="zone-summary">
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"
            ><app-icon name="pin" [size]="17"
          /></span>
          <div class="min-w-0 flex-1">
            <p class="text-[12.5px] font-medium text-muted">
              {{ detected() ? 'Barrio detectado' : 'Barrio' }} · lo ven los profesionales
            </p>
            <p class="text-[15.5px] font-semibold text-ink">{{ zone()!.name }}</p>
          </div>
          <button
            type="button"
            class="h-10 rounded-lg px-3 text-[14px] font-semibold text-brand hover:bg-brand-tint"
            [attr.aria-label]="'Cambiar barrio (' + zone()!.name + ')'"
            [disabled]="disabled()"
            (click)="changingZone.set(true)"
          >
            Cambiar
          </button>
        </div>
      } @else {
        <p [id]="id('zone-label')" class="text-[14px] font-semibold">
          @if (notDetected()) {
            No pudimos identificar el barrio.
          }
          Elegí {{ notDetected() ? 'el más cercano' : 'el barrio' }}
          <span class="font-normal text-muted">· lo ven los profesionales</span>
        </p>
        @if (outsideCity()) {
          <p class="mt-1 text-[13px] text-accent-ink" role="status">
            Esa dirección no parece ser de Tandil. Revisala antes de continuar.
          </p>
        }
        <div
          class="mt-2.5 flex flex-wrap gap-2"
          role="radiogroup"
          [attr.aria-labelledby]="id('zone-label')"
          [attr.aria-invalid]="!zone()"
        >
          @for (z of zones.zones(); track z.id) {
            <button
              type="button"
              role="radio"
              [appChip]="zone()?.id === z.id"
              [attr.aria-checked]="zone()?.id === z.id"
              class="rounded-full px-3.5 py-2 text-[14px]"
              [disabled]="disabled()"
              (click)="chooseZone(z)"
            >
              {{ z.name }}
            </button>
          }
        </div>
        <p class="mt-2.5 text-[12.5px] leading-[1.45] text-muted">
          Si no pudimos derivar un barrio, elegí el más cercano. No agregamos barrios
          automáticamente.
        </p>
      }
    </div>
  `,
})
export class WorkLocationPicker {
  protected readonly store = inject(RequestStore);
  protected readonly zones = inject(ZonesStore);
  protected readonly location = inject(LocationStore);
  protected readonly geo = inject(GeolocationService);
  private readonly api = inject(LocationApiService);
  private readonly browser = typeof window !== 'undefined';

  readonly idPrefix = input.required<string>();
  readonly disabled = input(false);

  protected readonly limits = REQUEST_LIMITS;
  protected readonly propertyOptions: { value: PropertyType; label: string }[] = [
    { value: 'HOUSE', label: 'Casa' },
    { value: 'APARTMENT', label: 'Departamento' },
    { value: 'OTHER', label: 'Otro' },
  ];
  protected readonly zone = computed(() => this.store.draft().zone);
  protected readonly confirmedLocation = computed(() => this.store.draft().location);
  protected readonly inputAddress = computed(
    () =>
      this.selected()?.address ?? this.confirmedLocation()?.address ?? this.store.exactAddress(),
  );
  protected readonly selected = signal<ResolvedLocation | null>(
    this.store.draft().location
      ? {
          address: this.store.draft().location!.address,
          formattedAddress: this.store.draft().location!.formattedAddress,
          latitude: this.store.draft().location!.latitude,
          longitude: this.store.draft().location!.longitude,
          providerPlaceId: this.store.draft().location!.providerPlaceId,
          zone: this.store.draft().zone,
          outsideCity: false,
          cityVerified: true,
        }
      : null,
  );
  protected readonly detected = signal(false);
  protected readonly notDetected = signal(false);
  protected readonly outsideCity = signal(false);
  protected readonly changingZone = signal(false);
  protected readonly locate = signal<LocateState>('idle');
  protected readonly locateMessage = computed(() => LOCATE_MESSAGES[this.locate()] ?? null);
  protected readonly suggestions = signal<AddressSuggestion[]>([]);
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly searching = signal(false);
  protected readonly autocompleteError = signal(false);
  protected readonly mapLoading = signal(false);
  protected readonly mapError = signal(false);
  protected readonly adjustingMap = signal(false);
  protected readonly mapAdjustError = signal<'not-found' | 'provider-error' | null>(null);
  protected readonly showSuggestions = computed(() => this.open() && this.suggestions().length > 0);
  private debounce?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private sub?: Subscription;
  private searchGeneration = 0;
  private mapElement?: HTMLDivElement;
  private map?: MapLibreMap;
  private marker?: MapLibreMarker;
  private mapClick?: (event: MapMouseEvent) => void;
  private markerDragEnd?: () => void;

  @ViewChild('mapHost')
  set mapHost(ref: ElementRef<HTMLDivElement> | undefined) {
    if (!ref) {
      this.mapElement = undefined;
      this.releaseMap();
      this.mapLoading.set(false);
      return;
    }
    this.mapElement = ref.nativeElement;
    void this.initializeMap(ref.nativeElement);
  }

  @ViewChild('addressInput')
  private addressInput?: ElementRef<HTMLInputElement>;

  constructor() {
    this.zones.load();
    this.location.load();
    effect(() => {
      const key = this.location.mapApiKey();
      const place = this.selected();
      if (key && place && this.mapElement && !this.map && !this.mapLoading()) {
        queueMicrotask(() => this.mapElement && void this.initializeMap(this.mapElement));
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.debounce);
      clearTimeout(this.closeTimer);
      this.sub?.unsubscribe();
      this.releaseMap();
    });
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }

  protected async useMyLocation(): Promise<void> {
    this.locate.set('locating');
    let coords: { lat: number; lng: number };
    try {
      coords = await this.geo.current();
    } catch (e) {
      this.locate.set(
        e instanceof GeolocationError && e.reason !== 'unsupported' ? e.reason : 'unavailable',
      );
      return;
    }
    try {
      const result = await firstValueFrom(this.api.reverse(coords.lat, coords.lng));
      if (!result) {
        this.locate.set('not-found');
        return;
      }
      this.locate.set('idle');
      this.apply(result);
    } catch {
      this.locate.set('provider-error');
    }
  }

  protected onAddress(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.clearConfirmedLocation();
    this.store.exactAddress.set(value);
    this.selected.set(null);
    this.outsideCity.set(false);
    if (this.detected()) this.store.clearZone();
    this.detected.set(false);
    this.notDetected.set(false);
    this.activeIndex.set(-1);
    this.searchGeneration++;
    this.sub?.unsubscribe();
    clearTimeout(this.debounce);
    this.autocompleteError.set(false);
    if (!this.location.enabled()) return;
    const query = value.trim();
    if (query.length < 3) {
      this.suggestions.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    const generation = this.searchGeneration;
    this.debounce = setTimeout(() => {
      this.sub = this.api.autocomplete(query).subscribe({
        next: (items) => {
          if (generation !== this.searchGeneration) return;
          this.suggestions.set(items);
          this.open.set(true);
          this.searching.set(false);
        },
        error: () => {
          if (generation !== this.searchGeneration) return;
          this.suggestions.set([]);
          this.searching.set(false);
          this.autocompleteError.set(true);
        },
      });
    }, 300);
  }

  protected retrySearch(): void {
    if (this.addressInput)
      this.onAddress({ target: this.addressInput.nativeElement } as unknown as Event);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.showSuggestions()) return;
    const n = this.suggestions().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => (i + 1) % n);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => (i <= 0 ? n - 1 : i - 1));
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.pick(this.suggestions()[this.activeIndex()]);
    } else if (event.key === 'Escape') this.open.set(false);
  }

  protected closeSoon(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.open.set(false), 150);
  }

  protected async pick(suggestion: AddressSuggestion): Promise<void> {
    this.open.set(false);
    this.suggestions.set([]);
    this.searching.set(true);
    try {
      const result = await firstValueFrom(
        this.api.resolve({ placeId: suggestion.id, selectedAddress: suggestion.main }),
      );
      if (result) this.apply(result);
      else this.markNotDetected();
    } catch {
      this.searching.set(false);
      this.autocompleteError.set(true);
      this.locate.set('provider-error');
    }
  }

  protected confirmLocation(): void {
    const place = this.selected();
    if (
      !place ||
      !place.cityVerified ||
      place.outsideCity ||
      place.latitude === null ||
      place.longitude === null
    )
      return;
    const location: ConfirmedRequestLocation = {
      address: place.address.slice(0, REQUEST_LIMITS.addressMax),
      formattedAddress: place.formattedAddress.slice(0, 500),
      latitude: place.latitude,
      longitude: place.longitude,
      providerPlaceId: place.providerPlaceId,
      propertyType: null,
      floor: null,
      unit: null,
    };
    this.store.setConfirmedLocation(location);
  }

  protected changeLocation(): void {
    this.store.clearConfirmedLocation();
  }

  protected chooseProperty(value: PropertyType): void {
    this.store.updatePropertyType(value);
  }

  protected onApartmentDetails(event: Event, field: 'floor' | 'unit'): void {
    const location = this.confirmedLocation();
    const value = (event.target as HTMLInputElement).value;
    this.store.updateApartmentDetails(
      field === 'floor' ? value : (location?.floor ?? ''),
      field === 'unit' ? value : (location?.unit ?? ''),
    );
  }

  protected chooseZone(zone: ZoneRef): void {
    this.store.setZone(zone);
    this.detected.set(false);
    this.notDetected.set(false);
    this.changingZone.set(false);
  }

  protected retryMap(): void {
    this.mapError.set(false);
    if (this.mapElement) void this.initializeMap(this.mapElement, true);
  }

  @HostListener('window:resize')
  protected syncResponsiveMap(): void {
    if (!this.browser || !this.selected()) return;
    if (this.isResponsiveInstanceActive()) {
      if (this.mapElement && !this.map) void this.initializeMap(this.mapElement);
    } else {
      this.releaseMap();
    }
  }

  private apply(result: ResolvedLocation): void {
    this.mapAdjustError.set(null);
    this.selected.set(result);
    this.outsideCity.set(result.outsideCity || !result.cityVerified);
    this.store.clearConfirmedLocation();
    this.store.exactAddress.set(result.address.slice(0, REQUEST_LIMITS.addressMax));
    if (result.zone && this.zones.byId(result.zone.id))
      this.setDetected(this.zones.byId(result.zone.id)!);
    else this.markNotDetected();
  }

  private setDetected(zone: ZoneRef): void {
    this.store.setZone(zone);
    this.detected.set(true);
    this.notDetected.set(false);
    this.changingZone.set(false);
  }

  private markNotDetected(): void {
    this.notDetected.set(true);
    if (this.detected()) this.store.clearZone();
    this.detected.set(false);
    this.changingZone.set(true);
  }

  private async initializeMap(element: HTMLDivElement, retry = false): Promise<void> {
    if (!this.browser || !this.isResponsiveInstanceActive()) return;
    const place = this.selected();
    if (
      !place ||
      place.latitude === null ||
      place.longitude === null ||
      !place.cityVerified ||
      place.outsideCity
    )
      return;
    if (this.map && this.mapElement === element && !retry) {
      this.map.easeTo({ center: [place.longitude, place.latitude] });
      this.marker?.setLngLat([place.longitude, place.latitude]);
      return;
    }
    this.mapLoading.set(true);
    this.mapError.set(false);
    const key = this.location.mapApiKey();
    if (!key) {
      this.mapLoading.set(false);
      this.mapError.set(true);
      return;
    }
    try {
      const maps = await import('maplibre-gl');
      ensureMapLibreStyles();
      // An earlier selection may have been replaced while the map chunk was loading.
      const current = this.selected();
      if (!this.isResponsiveInstanceActive()) {
        this.mapLoading.set(false);
        return;
      }
      if (
        !current ||
        !this.mapElement ||
        this.mapElement !== element ||
        current.latitude === null ||
        current.longitude === null
      ) {
        this.mapLoading.set(false);
        return;
      }
      this.releaseMap();
      const map = new maps.Map({
        container: element,
        style: `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${encodeURIComponent(key)}`,
        center: [current.longitude, current.latitude],
        zoom: 16,
        attributionControl: { compact: false },
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      this.map = map;
      map.addControl(new maps.NavigationControl({ showCompass: false }), 'top-right');
      map.once('load', () => this.mapLoading.set(false));
      map.on('error', () => {
        this.mapLoading.set(false);
        this.mapError.set(true);
      });
      const marker = new maps.Marker({ draggable: true })
        .setLngLat([current.longitude, current.latitude])
        .addTo(map);
      this.marker = marker;
      this.mapClick = (event) => void this.adjustPoint(event.lngLat.lat, event.lngLat.lng);
      map.on('click', this.mapClick);
      this.markerDragEnd = () => {
        const point = marker.getLngLat();
        void this.adjustPoint(point.lat, point.lng);
      };
      marker.on('dragend', this.markerDragEnd);
      if (map.isStyleLoaded()) this.mapLoading.set(false);
    } catch {
      this.mapLoading.set(false);
      this.mapError.set(true);
    }
  }

  private async adjustPoint(latitude: number, longitude: number): Promise<void> {
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return;
    const previous = this.selected();
    this.marker?.setLngLat([longitude, latitude]);
    this.store.clearConfirmedLocation();
    this.adjustingMap.set(true);
    this.mapAdjustError.set(null);
    try {
      const result = await firstValueFrom(this.api.reverse(latitude, longitude));
      if (!result) {
        this.locate.set('not-found');
        this.mapAdjustError.set('not-found');
        if (previous && previous.latitude !== null && previous.longitude !== null)
          this.marker?.setLngLat([previous.longitude, previous.latitude]);
        return;
      }
      this.locate.set('idle');
      this.apply(result);
    } catch {
      this.locate.set('provider-error');
      this.mapAdjustError.set('provider-error');
      if (previous && previous.latitude !== null && previous.longitude !== null)
        this.marker?.setLngLat([previous.longitude, previous.latitude]);
    } finally {
      this.adjustingMap.set(false);
    }
  }

  private isResponsiveInstanceActive(): boolean {
    const prefix = this.idPrefix();
    const desktopInstance = /(?:^|-)d$/.test(prefix);
    const mobileInstance = /(?:^|-)m$/.test(prefix);
    if (!desktopInstance && !mobileInstance) return true;
    const desktop = window.matchMedia?.('(min-width: 1024px)').matches ?? true;
    return desktop ? desktopInstance : mobileInstance;
  }

  private releaseMap(): void {
    if (this.map && this.mapClick) this.map.off('click', this.mapClick);
    if (this.marker && this.markerDragEnd) this.marker.off('dragend', this.markerDragEnd);
    this.marker?.remove();
    this.map?.remove();
    this.mapClick = undefined;
    this.markerDragEnd = undefined;
    this.marker = undefined;
    this.map = undefined;
    this.mapElement?.replaceChildren();
  }
}
