import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { LocationApiService } from '../../../core/api/location-api.service';
import { LocalityRef } from '../../../core/models/locality';
import { GeolocationError, GeolocationService } from '../../../core/services/geolocation.service';
import { LocalityStore } from '../../../core/state/locality.store';
import { LocationStore } from '../../../core/state/location.store';
import { Icon } from '../icon/icon';

/** Una lectura voluntaria, localidad confirmada por id; no guarda dirección ni coordenadas. */
@Component({
  selector: 'app-locality-detection',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (location.enabled() && geo.supported) {
      <div class="mt-4 border-b border-line pb-4" data-testid="locality-detection">
        <button
          type="button"
          class="button-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          [disabled]="busy()"
          [attr.aria-busy]="busy()"
          (click)="locate()"
        >
          <app-icon name="locate" [size]="18" />{{
            busy() ? 'Buscando tu localidad…' : 'Usar mi ubicación'
          }}
        </button>
        <p class="mt-2 text-sm leading-5 text-muted">
          Solo para sugerir una localidad. Podés buscar para otro lugar; no guardamos tu ubicación
          precisa.
        </p>
        @if (candidate(); as city) {
          <div
            class="mt-3 rounded-xl border border-brand-line bg-brand-tint p-3"
            data-testid="detected-locality"
          >
            <p class="text-sm text-ink">
              Detectamos <strong>{{ city.label }}</strong
              >. ¿Buscás ahí?
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="button-primary min-h-11 rounded-xl px-4 text-sm font-semibold"
                (click)="confirm()"
              >
                Usar esta localidad
              </button>
              <button
                type="button"
                class="min-h-11 rounded-xl px-3 text-sm font-semibold text-brand"
                (click)="cancel()"
              >
                Elegir otra
              </button>
            </div>
          </div>
        }
        <p class="mt-2 text-sm text-ink-soft" role="status">{{ message() }}</p>
      </div>
    }
  `,
})
export class LocalityDetection {
  protected readonly location = inject(LocationStore);
  protected readonly geo = inject(GeolocationService);
  private readonly api = inject(LocationApiService);
  private readonly catalog = inject(LocalitiesApiService);
  private readonly store = inject(LocalityStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly picked = output<LocalityRef>();
  readonly manualRequested = output<void>();
  protected readonly busy = signal(false);
  protected readonly candidate = signal<LocalityRef | null>(null);
  protected readonly message = signal('');
  private attempt = 0;
  private version = 0;

  constructor() {
    this.location.load();
    this.destroyRef.onDestroy(() => ++this.attempt);
  }

  protected cancel(): void {
    ++this.attempt;
    this.busy.set(false);
    this.candidate.set(null);
    this.message.set('Elegí la localidad con el buscador de abajo.');
    this.manualRequested.emit();
  }

  protected async locate(): Promise<void> {
    if (this.busy() || !this.location.enabled() || !this.geo.supported) return;
    const attempt = ++this.attempt;
    this.version = this.store.version();
    this.busy.set(true);
    this.candidate.set(null);
    this.message.set('');
    try {
      const coords = await this.geo.current();
      if (attempt !== this.attempt) return;
      const result = await firstValueFrom(this.api.reverse(coords.lat, coords.lng));
      if (attempt !== this.attempt) return;
      const id = result?.suggestedLocality?.id;
      if (!id) {
        this.message.set(
          'No pudimos identificar una localidad con certeza. Elegila en el buscador.',
        );
        return;
      }
      const locality = await firstValueFrom(this.catalog.get(id));
      if (attempt !== this.attempt) return;
      if (this.store.version() !== this.version) {
        this.message.set('La localidad cambió mientras buscábamos. Conservamos tu elección.');
        return;
      }
      this.candidate.set(locality);
      this.message.set('Localidad encontrada. Confirmá si querés buscar ahí.');
    } catch (error) {
      if (attempt !== this.attempt) return;
      this.message.set(
        error instanceof GeolocationError && error.reason === 'denied'
          ? 'No diste permiso para usar tu ubicación. Podés elegir la localidad a mano.'
          : 'No pudimos detectar tu localidad. Reintentá o elegila a mano.',
      );
    } finally {
      if (attempt === this.attempt) this.busy.set(false);
    }
  }

  protected confirm(): void {
    const city = this.candidate();
    if (!city) return;
    if (this.store.version() !== this.version) {
      this.cancel();
      return;
    }
    this.picked.emit(city);
  }
}
