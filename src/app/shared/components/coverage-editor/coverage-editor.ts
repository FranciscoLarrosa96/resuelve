import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { LocalitiesApiService } from '../../../core/api/localities-api.service';
import { Zone } from '../../../core/models/category';
import { LocalityRef } from '../../../core/models/locality';
import { LocalityStore } from '../../../core/state/locality.store';
import { Icon } from '../icon/icon';
import { LocalityPicker } from '../locality-picker/locality-picker';
import { ZoneCoveragePicker } from '../zone-autocomplete/zone-coverage-picker';

/** Una localidad de la cobertura mientras se edita. */
export interface CoverageDraft {
  locality: LocalityRef;
  coversEntireCity: boolean;
  zoneIds: string[];
}

/** Mismo tope que el backend (`MAX_COVERAGE_LOCALITIES`). */
export const MAX_COVERAGE_LOCALITIES = 20;

/** Qué falta para guardar la cobertura (null = lista). Misma regla que el backend. */
export function coverageIssue(
  list: readonly CoverageDraft[],
  primaryId: string | null,
): string | null {
  if (!list.length) return 'Elegí al menos una localidad donde trabajás.';
  const empty = list.find((c) => !c.coversEntireCity && !c.zoneIds.length);
  if (empty)
    return `Elegí al menos un barrio de ${empty.locality.name} o marcá que trabajás en toda la ciudad.`;
  if (!primaryId || !list.some((c) => c.locality.id === primaryId))
    return 'Elegí tu ciudad principal.';
  return null;
}

/** Payload de la API (`coverage` + `primaryLocalityId`). */
export function coveragePayload(list: readonly CoverageDraft[], primaryId: string | null) {
  return {
    ...(primaryId ? { primaryLocalityId: primaryId } : {}),
    coverage: list.map((c) => ({
      localityId: c.locality.id,
      coversEntireCity: c.coversEntireCity,
      zoneIds: c.zoneIds,
    })),
  };
}

type ZonesState = Zone[] | 'loading' | 'error';
let nextId = 0;

/**
 * "¿Dónde trabajás?" del profesional: una ciudad principal y, si quiere, otras
 * localidades. En cada una, toda la ciudad o algunos barrios (si la localidad
 * tiene barrios cargados; si no, solo toda la ciudad). Un solo perfil para todas.
 */
@Component({
  selector: 'app-coverage-editor',
  imports: [Icon, LocalityPicker, ZoneCoveragePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!coverage().length) {
      <p class="text-[15px] text-ink-soft">
        Empezá por tu ciudad principal: donde trabajás la mayor parte del tiempo.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        @if (suggestion(); as s) {
          <button
            type="button"
            class="button-primary min-h-11 rounded-xl px-4 text-[15px] font-semibold"
            (click)="add(s)"
          >
            Trabajo en {{ s.name }}
          </button>
        }
        <app-locality-picker
          mode="emit"
          [variant]="suggestion() ? 'link' : 'field'"
          [emptyText]="suggestion() ? 'Elegir otra ciudad' : 'Elegí tu ciudad principal'"
          title="¿Cuál es tu ciudad principal?"
          hint="Después podés sumar otras localidades donde también trabajás."
          (picked)="add($event)"
        />
      </div>
    } @else {
      <ul class="space-y-4">
        @for (c of coverage(); track c.locality.id; let i = $index) {
          <li
            class="rounded-2xl border border-line bg-surface p-4"
            [attr.data-testid]="'coverage-' + c.locality.slug"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand"
                ><app-icon name="pin" [size]="17"
              /></span>
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-ink">{{ c.locality.label }}</p>
                @if (coverage().length > 1) {
                  <label
                    class="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2 text-[14px] text-ink-soft"
                  >
                    <input
                      type="radio"
                      class="size-4 accent-brand"
                      [name]="uid + '-primary'"
                      [checked]="primaryId() === c.locality.id"
                      (change)="primaryId.set(c.locality.id)"
                    />
                    Ciudad principal
                  </label>
                } @else {
                  <p class="mt-0.5 text-[13.5px] text-muted">Ciudad principal</p>
                }
              </div>
              <button
                type="button"
                class="flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
                [attr.aria-label]="'Quitar ' + c.locality.name"
                (click)="remove(c.locality.id)"
              >
                <app-icon name="close" [size]="16" />
              </button>
            </div>

            @switch (zoneState(c.locality.id)) {
              @case ('loading') {
                <p class="mt-3 text-[14px] text-muted" role="status">Cargando barrios…</p>
              }
              @case ('error') {
                <p class="mt-3 flex items-center gap-3 text-[14px] text-muted" role="alert">
                  No pudimos cargar los barrios.
                  <button
                    type="button"
                    class="font-semibold text-brand underline"
                    (click)="loadZones(c.locality.id, true)"
                  >
                    Reintentar
                  </button>
                </p>
              }
              @case ('none') {
                <p class="mt-3 text-[14.5px] text-ink-soft">
                  Trabajás en toda la ciudad. Vas a aparecer en búsquedas de {{ c.locality.name }}.
                </p>
              }
              @default {
                <fieldset class="mt-3">
                  <legend class="sr-only">Cobertura en {{ c.locality.name }}</legend>
                  <div class="grid gap-2 sm:grid-cols-2">
                    <label
                      class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-surface px-4 py-3 focus-within:border-brand"
                      [class]="c.coversEntireCity ? 'border-brand bg-brand-tint' : 'border-line'"
                    >
                      <input
                        type="radio"
                        class="size-4 accent-brand"
                        [name]="uid + '-scope-' + i"
                        [checked]="c.coversEntireCity"
                        (change)="setEntire(c.locality.id, true)"
                      />
                      <span class="font-medium">Todo {{ c.locality.name }}</span>
                    </label>
                    <label
                      class="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-surface px-4 py-3 focus-within:border-brand"
                      [class]="!c.coversEntireCity ? 'border-brand bg-brand-tint' : 'border-line'"
                    >
                      <input
                        type="radio"
                        class="size-4 accent-brand"
                        [name]="uid + '-scope-' + i"
                        [checked]="!c.coversEntireCity"
                        (change)="setEntire(c.locality.id, false)"
                      />
                      <span class="font-medium">Solo algunos barrios</span>
                    </label>
                  </div>
                </fieldset>
                @if (c.coversEntireCity) {
                  <p class="mt-3 text-[14.5px] text-ink-soft">
                    Vas a aparecer en búsquedas de cualquier barrio de {{ c.locality.name }}.
                  </p>
                } @else {
                  <div class="mt-3">
                    <p [id]="uid + '-zones-' + i" class="mb-2 text-sm font-semibold text-muted">
                      Barrios de {{ c.locality.name }}
                    </p>
                    <app-zone-coverage-picker
                      [inputId]="uid + '-zone-search-' + i"
                      [labelledBy]="uid + '-zones-' + i"
                      [zones]="zonesOf(c.locality.id)"
                      [selectedIds]="c.zoneIds"
                      (toggle)="toggleZone(c.locality.id, $event)"
                    />
                  </div>
                }
              }
            }
          </li>
        }
      </ul>
      @if (coverage().length < max) {
        <div class="mt-4">
          <app-locality-picker
            mode="emit"
            variant="link"
            emptyText="+ Agregar otra localidad"
            title="Agregar una localidad"
            hint="Sumá otra ciudad o pueblo donde también trabajás. Tu perfil, reseñas y plan son los mismos."
            [excludeIds]="ids()"
            (picked)="add($event)"
          />
        </div>
      }
    }
  `,
})
export class CoverageEditor {
  private readonly api = inject(LocalitiesApiService);
  private readonly locality = inject(LocalityStore);

  readonly coverage = model<CoverageDraft[]>([]);
  readonly primaryId = model<string | null>(null);
  /** Sugerir la ciudad donde la persona estaba buscando (un toque). */
  readonly suggest = input(true);

  protected readonly uid = `coverage-${++nextId}`;
  protected readonly max = MAX_COVERAGE_LOCALITIES;
  private readonly zones = signal<Record<string, ZonesState>>({});
  protected readonly ids = computed(() => this.coverage().map((c) => c.locality.id));
  protected readonly suggestion = computed(() => (this.suggest() ? this.locality.current() : null));

  constructor() {
    // Barrios de cada localidad (también las de un perfil existente). loadZones no repite.
    effect(() => {
      const ids = this.ids();
      untracked(() => ids.forEach((id) => this.loadZones(id)));
    });
  }

  protected zoneState(id: string): 'loading' | 'error' | 'none' | 'zones' {
    const state = this.zones()[id];
    if (state === undefined || state === 'loading') return 'loading';
    if (state === 'error') return 'error';
    return state.length ? 'zones' : 'none';
  }

  protected zonesOf(id: string): Zone[] {
    const state = this.zones()[id];
    return Array.isArray(state) ? state : [];
  }

  /** Barrios de una localidad (una vez). Sin barrios: se cubre toda la ciudad. */
  loadZones(id: string, force = false): void {
    const current = this.zones()[id];
    if (!force && current !== undefined && current !== 'error') return;
    this.zones.update((z) => ({ ...z, [id]: 'loading' }));
    this.api.neighborhoods(id).subscribe({
      next: (list) => {
        this.zones.update((z) => ({ ...z, [id]: list }));
        if (!list.length) this.patch(id, { coversEntireCity: true });
        else {
          // Barrios guardados que ya no existen se quitan (nunca se envía uno inválido).
          const valid = new Set(list.map((zone) => zone.id));
          const entry = this.coverage().find((c) => c.locality.id === id);
          if (entry?.zoneIds.some((zid) => !valid.has(zid)))
            this.patch(id, { zoneIds: entry.zoneIds.filter((zid) => valid.has(zid)) });
        }
      },
      error: () => this.zones.update((z) => ({ ...z, [id]: 'error' })),
    });
  }

  protected add(locality: LocalityRef): void {
    if (this.ids().includes(locality.id) || this.coverage().length >= this.max) return;
    // Por defecto toda la ciudad: es lo más simple; con barrios se puede afinar.
    this.coverage.update((list) => [...list, { locality, coversEntireCity: true, zoneIds: [] }]);
    if (!this.primaryId() || !this.ids().includes(this.primaryId()!))
      this.primaryId.set(locality.id);
    this.loadZones(locality.id);
  }

  protected remove(id: string): void {
    this.coverage.update((list) => list.filter((c) => c.locality.id !== id));
    if (this.primaryId() === id) this.primaryId.set(this.coverage()[0]?.locality.id ?? null);
  }

  protected setEntire(id: string, entire: boolean): void {
    this.patch(id, { coversEntireCity: entire });
  }

  protected toggleZone(id: string, zoneId: string): void {
    const entry = this.coverage().find((c) => c.locality.id === id);
    if (!entry) return;
    const has = entry.zoneIds.includes(zoneId);
    if (!has && entry.zoneIds.length >= 60) return;
    this.patch(id, {
      zoneIds: has ? entry.zoneIds.filter((z) => z !== zoneId) : [...entry.zoneIds, zoneId],
    });
  }

  private patch(id: string, patch: Partial<CoverageDraft>): void {
    this.coverage.update((list) =>
      list.map((c) => (c.locality.id === id ? { ...c, ...patch } : c)),
    );
  }
}
