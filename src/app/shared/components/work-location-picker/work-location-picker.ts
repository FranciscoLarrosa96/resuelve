import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { LocationApiService } from '../../../core/api/location-api.service';
import { AddressSuggestion, ResolvedLocation } from '../../../core/models/location';
import { REQUEST_LIMITS } from '../../../core/models/request';
import { ZoneRef } from '../../../core/models/service-request';
import { GeolocationError, GeolocationService } from '../../../core/services/geolocation.service';
import { LocationStore } from '../../../core/state/location.store';
import { RequestStore } from '../../../core/state/request.store';
import { ZonesStore } from '../../../core/state/zones.store';
import { zoneFromText } from '../../../core/utils/zone-from-text';
import { ZoneAutocomplete } from '../zone-autocomplete/zone-autocomplete';
import { Icon } from '../icon/icon';
import { LocalityPicker } from '../locality-picker/locality-picker';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { LocalityRef, toLocalityRef } from '../../../core/models/locality';

type LocateState =
  'idle' | 'locating' | 'denied' | 'timeout' | 'unavailable' | 'provider-error' | 'not-found';

const LOCATE_MESSAGES: Partial<Record<LocateState, string>> = {
  denied: 'No tenemos permiso para usar tu ubicación. Escribí la dirección o elegí el barrio.',
  timeout: 'Tu ubicación tardó demasiado. Escribí la dirección o elegí el barrio.',
  unavailable: 'No pudimos obtener tu ubicación. Escribí la dirección o elegí el barrio.',
  'provider-error': 'No pudimos buscar la dirección ahora. Escribila a mano y elegí el barrio.',
  'not-found': 'No encontramos una dirección para tu ubicación. Escribila a mano.',
};

/**
 * "¿Dónde es el trabajo?": UNA sola experiencia para todos los flujos
 * (Crear solicitud, Urgencias, Buscar → Solicitar presupuesto, perfil →
 * Solicitar presupuesto y Editar). El título lo pone la pantalla; el
 * formulario es siempre este.
 *
 * 1. "Usar mi ubicación" (si hay proveedor): coordenadas del navegador →
 *    backend → dirección sugerida + barrio. Las coordenadas no se guardan.
 * 2. Dirección: autocompletado por el backend (si hay proveedor) o texto libre.
 * 3. Barrio (lo único que ven los invitados): derivado y confirmable
 *    ("Barrio detectado · Villa Italia · Cambiar") o, si no se pudo, elegir el
 *    más cercano de la lista real. Nunca se elige uno silenciosamente.
 *
 * La dirección vive solo en memoria (`RequestStore.exactAddress`).
 */
@Component({
  selector: 'app-work-location-picker',
  imports: [ZoneAutocomplete, Icon, LocalityPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'work-location-picker' },
  template: `
    <!-- 1. Localidad del trabajo (puede no ser la de residencia). Define a quién le llega el pedido. -->
    <p [id]="id('locality-label')" class="text-[14px] font-semibold">Localidad</p>
    <app-locality-picker
      class="mt-1.5 w-full"
      mode="emit"
      variant="field"
      [value]="store.locality()"
      emptyText="Elegí la localidad del trabajo"
      title="¿En qué localidad es el trabajo?"
      hint="Solo le llega a profesionales que trabajan en esa localidad."
      (picked)="chooseLocality($event)"
    />
    @if (suggested(); as s) {
      <p class="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-soft" role="status" data-testid="suggested-locality">
        La dirección parece ser de {{ s.label }}.
        <button type="button" class="font-semibold text-brand underline" (click)="useSuggested(s.id)">Usar {{ s.name }}</button>
      </p>
    }
    <div class="my-4 h-px bg-line-soft" aria-hidden="true"></div>

    @if (location.enabled() && geo.supported) {
      <button
        type="button"
        class="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-brand bg-surface px-4 text-[15px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-60 press"
        [disabled]="disabled() || locate() === 'locating'"
        (click)="useMyLocation()"
      >
        @if (locate() === 'locating') {
          <span
            class="size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
            aria-hidden="true"
          ></span
          >Buscando tu ubicación…
        } @else {
          <app-icon name="locate" [size]="17" />Usar mi ubicación
        }
      </button>
      @if (locateMessage(); as m) {
        <p
          class="mt-2 flex gap-2 text-[14px] leading-[1.45] text-ink-soft"
          role="status"
          data-testid="locate-message"
        >
          <app-icon name="info" [size]="14" class="mt-0.5 shrink-0 text-muted" />{{ m }}
        </p>
      }
      <div class="my-3.5 flex items-center gap-3 text-[14px] text-muted" aria-hidden="true">
        <span class="h-px flex-1 bg-line"></span>o escribí la dirección<span
          class="h-px flex-1 bg-line"
        ></span>
      </div>
    }

    <label [for]="id('address')" class="block text-[14px] font-semibold"
      >Dirección <span class="font-normal text-muted">(opcional)</span></label
    >
    <div class="relative mt-1.5">
      <input
        [id]="id('address')"
        type="text"
        autocomplete="street-address"
        [attr.maxlength]="limits.addressMax"
        placeholder="Calle y número..."
        class="h-12.5 w-full rounded-xl border-[1.5px] border-line-input bg-surface px-3.5 text-[15.5px] text-ink outline-none focus:border-brand disabled:opacity-60"
        [attr.role]="location.enabled() ? 'combobox' : null"
        [attr.aria-autocomplete]="location.enabled() ? 'list' : null"
        [attr.aria-expanded]="location.enabled() ? showSuggestions() : null"
        [attr.aria-controls]="location.enabled() ? id('suggestions') : null"
        [attr.aria-activedescendant]="activeIndex() >= 0 ? id('opt-' + activeIndex()) : null"
        [attr.aria-describedby]="id('address-hint')"
        [value]="store.exactAddress()"
        [disabled]="disabled()"
        (input)="onAddress($event)"
        (keydown)="onKey($event)"
        (blur)="closeSoon()"
      />
      @if (showSuggestions()) {
        <ul
          [id]="id('suggestions')"
          role="listbox"
          aria-label="Direcciones sugeridas"
          class="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-float"
        >
          @for (s of suggestions(); track s.id; let i = $index) {
            <li
              [id]="id('opt-' + i)"
              role="option"
              [attr.aria-selected]="activeIndex() === i"
              class="cursor-pointer px-3.5 py-2.5 text-[14.5px]"
              [class.bg-brand-tint]="activeIndex() === i"
              (mousedown)="$event.preventDefault(); pick(s)"
            >
              <span class="font-semibold text-ink">{{ s.main }}</span>
              @if (s.secondary) {
                <span class="block text-[14px] text-muted">{{ s.secondary }}</span>
              }
            </li>
          }
        </ul>
      }
    </div>
    <p [id]="id('address-hint')" class="mt-1.5 flex gap-2 text-[14px] leading-[1.45] text-muted">
      <app-icon name="lock" class="mt-px shrink-0" [size]="13" />
      Solo la ve el profesional que elijas, cuando aceptes su presupuesto. No la guardamos en este
      dispositivo.
    </p>

    <div class="mt-4 border-t border-line-soft pt-3.5">
      @if (!store.locality()) {
        <p class="text-[14px] text-muted">Elegí la localidad para ver sus barrios.</p>
      } @else if (zones.error()) {
        <div class="flex items-center gap-3 text-sm text-muted" role="alert">
          No pudimos cargar los barrios.
          <button type="button" class="font-semibold text-brand underline" (click)="zones.retry()">
            Reintentar
          </button>
        </div>
      } @else if (!zonesReady()) {
        <div class="flex flex-wrap gap-2" aria-hidden="true">
          @for (s of [1, 2, 3, 4]; track s) {
            <span class="shimmer h-10 w-24 rounded-full"></span>
          }
        </div>
        <span class="sr-only" role="status">Cargando barrios…</span>
      } @else if (!zones.hasZones()) {
        <!-- Ciudad sin barrios cargados: funciona igual, por ciudad completa. -->
        <div class="flex items-center gap-3" data-testid="locality-without-zones">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"
            ><app-icon name="pin" [size]="17"
          /></span>
          <p class="text-[14.5px] leading-[1.45] text-ink-soft">
            Lo ven los profesionales: <strong class="text-ink">{{ store.locality()!.name }}</strong>. Le llega a
            quienes trabajan en toda la ciudad.
          </p>
        </div>
        @if (outsideCity()) {
          <p class="mt-2 text-[14px] text-accent-ink" role="status">
            Esa dirección no parece ser de {{ store.locality()!.name }}. Revisala o cambiá la localidad.
          </p>
        }
      } @else if (zone() && !changingZone()) {
        <div class="flex items-center gap-3" data-testid="zone-summary">
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"
            ><app-icon name="pin" [size]="17"
          /></span>
          <div class="min-w-0 flex-1">
            <p class="text-[14px] font-medium text-muted">
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
          <p class="mt-1 text-[14px] text-accent-ink" role="status">
            Esa dirección no parece ser de {{ store.locality()?.name }}. Revisala, cambiá la localidad o elegí el barrio más cercano.
          </p>
        }
        <app-zone-autocomplete
          class="mt-2.5"
          [inputId]="id('zone-search')"
          [zones]="zones.zones()"
          [labelledBy]="id('zone-label')"
          [invalid]="!zone()"
          [disabled]="disabled()"
          placeholder="Escribí tu barrio (Centro, Villa Italia…)"
          (chosen)="chooseZone($event)"
        />
        <p class="mt-2.5 text-[14px] leading-[1.45] text-muted">
          ¿No encontrás tu barrio? Elegí el más cercano: con la dirección el profesional llega
          igual.
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

  /** Prefijo de ids (hay una instancia en desktop y otra en mobile). */
  readonly idPrefix = input.required<string>();
  readonly disabled = input(false);

  protected readonly limits = REQUEST_LIMITS;
  protected readonly zone = computed(() => this.store.draft().zone);
  /** El barrio salió de la dirección/ubicación (no lo tocó la persona). */
  protected readonly detected = signal(false);
  /** Se intentó detectar y no se pudo: "No pudimos identificar el barrio". */
  protected readonly notDetected = signal(false);
  protected readonly outsideCity = signal(false);
  protected readonly changingZone = signal(false);
  protected readonly locate = signal<LocateState>('idle');
  protected readonly locateMessage = computed(() => LOCATE_MESSAGES[this.locate()] ?? null);

  protected readonly suggestions = signal<AddressSuggestion[]>([]);
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly showSuggestions = computed(() => this.open() && this.suggestions().length > 0);
  /** Barrios cargados de ESTA localidad (no de la que se miró antes). */
  protected readonly zonesReady = computed(
    () => this.zones.loaded() && this.zones.localityId() === (this.store.locality()?.id ?? null),
  );
  /** Localidad del catálogo que sugiere la dirección, si es otra que la elegida. */
  protected readonly suggested = signal<{ id: string; name: string; label: string } | null>(null);
  private readonly localitiesApi = inject(LocalitiesApiService);
  private readonly session = newSessionToken();
  private debounce?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private sub?: Subscription;

  constructor() {
    // Barrios de la localidad del trabajo; al conocerlos, el pedido sabe si el barrio es obligatorio.
    effect(() => {
      const id = this.store.locality()?.id ?? null;
      untracked(() => this.zones.load(id));
    });
    effect(() => {
      const ready = this.zonesReady();
      const id = this.zones.localityId();
      const hasZones = this.zones.hasZones();
      untracked(() => {
        if (ready && id) this.store.setLocalityNeighborhoods(id, hasZones);
      });
    });
    this.location.load();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.debounce);
      clearTimeout(this.closeTimer);
      this.sub?.unsubscribe();
    });
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }

  // ---- Usar mi ubicación -----------------------------------------------------
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
      const result = await firstValueFrom(this.api.reverse(coords.lat, coords.lng, this.store.locality()?.id));
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

  // ---- Dirección ---------------------------------------------------------------
  protected onAddress(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.exactAddress.set(value);
    this.activeIndex.set(-1);
    // Sin proveedor (o mientras escribe): si nombra UN barrio real, se detecta (y se puede cambiar).
    const named = zoneFromText(value, this.zones.zones());
    if (named && (!this.zone() || this.detected())) this.setDetected(named);
    if (!this.location.enabled()) return;
    clearTimeout(this.debounce);
    const query = value.trim();
    if (query.length < 3) {
      this.suggestions.set([]);
      return;
    }
    this.debounce = setTimeout(() => {
      this.sub?.unsubscribe();
      this.sub = this.api.autocomplete(query, this.session, this.store.locality()?.id).subscribe({
        next: (items) => {
          this.suggestions.set(items);
          this.open.set(true);
        },
        // Si el proveedor falla, se sigue escribiendo a mano: sin sugerencias.
        error: () => this.suggestions.set([]),
      });
    }, 300);
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
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  protected closeSoon(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.open.set(false), 150);
  }

  protected async pick(s: AddressSuggestion): Promise<void> {
    this.open.set(false);
    this.suggestions.set([]);
    this.store.exactAddress.set(s.main);
    try {
      const result = await firstValueFrom(
        this.api.resolve({ placeId: s.id }, this.session, this.store.locality()?.id),
      );
      if (result) this.apply(result);
      else this.markNotDetected();
    } catch {
      this.locate.set('provider-error');
      this.markNotDetected();
    }
  }

  // ---- Localidad ----------------------------------------------------------------
  protected chooseLocality(locality: LocalityRef): void {
    this.suggested.set(null);
    this.outsideCity.set(false);
    this.detected.set(false);
    this.notDetected.set(false);
    this.changingZone.set(false);
    this.store.setLocality(locality);
  }

  /** "Usar Mar del Plata": se trae la localidad completa del catálogo (slug, provincia) y se elige. */
  protected useSuggested(id: string): void {
    this.localitiesApi.get(id).subscribe({
      next: (detail) => {
        const ref = toLocalityRef(detail);
        if (ref) this.chooseLocality(ref);
      },
      error: () => this.suggested.set(null),
    });
  }

  // ---- Barrio ------------------------------------------------------------------
  protected chooseZone(z: ZoneRef): void {
    this.store.setZone(z);
    this.detected.set(false);
    this.notDetected.set(false);
    this.changingZone.set(false);
  }

  private apply(result: ResolvedLocation): void {
    this.store.exactAddress.set(result.address.slice(0, REQUEST_LIMITS.addressMax));
    this.outsideCity.set(result.outsideCity);
    // La dirección es de otra localidad del catálogo: se sugiere, nunca se cambia sola.
    const s = result.suggestedLocality;
    this.suggested.set(
      s && s.id !== this.store.locality()?.id ? { id: s.id, name: s.name, label: `${s.name}, ${s.province}` } : null,
    );
    const zone = result.zone && this.zones.byId(result.zone.id);
    if (zone) this.setDetected(zone);
    else this.markNotDetected();
  }

  private setDetected(z: ZoneRef): void {
    this.store.setZone(z);
    this.detected.set(true);
    this.notDetected.set(false);
    this.changingZone.set(false);
  }

  /** No se pudo inferir: nunca queda uno "detectado" viejo; se pide elegir el más cercano. */
  private markNotDetected(): void {
    this.notDetected.set(true);
    if (this.detected()) this.store.clearZone();
    this.detected.set(false);
    this.changingZone.set(true);
  }
}

function newSessionToken(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
