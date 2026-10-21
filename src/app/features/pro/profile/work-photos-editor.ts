import { ProStore } from '../../../core/state/pro.store';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MAX_CAPTION_LENGTH,
  MAX_WORK_DESCRIPTION_LENGTH,
  MAX_WORK_TITLE_LENGTH,
  MIN_WORK_YEAR,
  PHOTOS_PER_WORK,
  PRO_WORK_LIMIT,
  WORK_PHOTO_MESSAGES,
  WORK_PHOTO_MIME_TYPES,
  WorkPhotosStore,
  currentWorkMonth,
  workMonthLabel,
} from '../../../core/state/work-photos.store';
import { Work, WorkPhoto } from '../../../core/models/professional';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';
import { PortfolioPreview } from './portfolio-preview';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * "Trabajos realizados" en /pro/perfil: cada trabajo ("Casa 1", con mes y
 * año) agrupa hasta 5 fotos. Crear, editar y borrar trabajos; subir,
 * describir, ordenar (la primera es la portada), pasar a otro trabajo y
 * borrar fotos. Publicación exclusiva de PRO (10) y Plus (30); no es
 * obligatorio ni afecta búsquedas. Los topes los garantiza el backend; acá
 * solo se anticipan.
 */
@Component({
  selector: 'app-work-photos-editor',
  imports: [Dialog, Icon, PortfolioPreview, RouterLink, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-2xl border border-line bg-surface p-5" aria-labelledby="sec-work" data-testid="work-photos-editor">
      <div class="flex items-start gap-3">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-sand text-ink-soft" aria-hidden="true"
          ><app-icon name="camera" [size]="17" [stroke]="1.9"
        /></span>
        <div class="min-w-0 flex-1">
          <h2 id="sec-work" class="text-[17px] leading-6 font-bold">Trabajos realizados</h2>
          <p class="text-[14px] text-muted">
            Agrupá las fotos por trabajo para que los clientes vean lo que hacés. Cada trabajo puede tener hasta
            {{ store.photosPerWork() }} fotos.
          </p>
        </div>
        @if (store.works().length && store.maxWorks() > 0) {
          <span class="shrink-0 pt-0.5 text-[14px] font-semibold text-ink-soft" data-testid="work-count"
            >{{ store.activeWorks().length }} de {{ store.maxWorks() }} {{ store.maxWorks() === 1 ? 'trabajo' : 'trabajos' }}</span
          >
        }
      </div>

      <input
        #file
        type="file"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        [attr.accept]="accept"
        (change)="onFile(file)"
        data-testid="work-file"
      />

      @if (store.loadError()) {
        <p class="mt-4 text-[14px] text-danger" role="alert">
          {{ messages.loadFailed }}
          <button type="button" class="ml-1 font-semibold text-ink underline underline-offset-2" (click)="store.load()">Reintentar</button>
        </p>
      } @else if (!store.loaded()) {
        <div class="mt-4 grid gap-3" role="status">
          <span class="sr-only">Cargando tus trabajos…</span>
          <span class="shimmer h-6 w-40 rounded-md" aria-hidden="true"></span>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <span class="shimmer aspect-[4/3] rounded-xl"></span>
            }
          </div>
        </div>
      } @else if (store.isFree()) {
        <div class="mt-5 border-t border-line pt-5" data-testid="portfolio-pro-required">
          <h3 class="text-lg font-bold">Mostrá tus trabajos con Resuelve PRO</h3>
          <p class="mt-2 text-sm leading-6 text-ink-soft">Publicá hasta {{ proLimit }} trabajos, con {{ perWork }} fotos cada uno, para que los clientes conozcan lo que hacés. La publicación de trabajos está incluida en PRO y PRO Plus.</p>
          <a routerLink="/pro/plan" fragment="contratar" class="button-primary mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-semibold">Ver planes PRO</a>
          @if (store.works().length) {
            <p class="mt-4 text-sm leading-6 text-muted">Tus trabajos siguen guardados y ocultos. Con acceso PRO podés elegir cuáles volver a publicar.</p>
            <ul class="mt-3 divide-y divide-line" aria-label="Trabajos guardados">
              @for (work of store.works(); track work.id) {
                <li class="flex items-center justify-between gap-3 py-3">
                  <div class="min-w-0"><p class="break-words text-sm font-semibold">{{ work.title }}</p><p class="text-sm text-muted">{{ monthLabel(work.doneOn) }} · {{ work.photos.length }} {{ work.photos.length === 1 ? 'foto guardada' : 'fotos guardadas' }}</p></div>
                  <button type="button" class="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-danger disabled:opacity-50" [disabled]="store.busy()" [attr.aria-label]="'Borrar el trabajo ' + work.title" (click)="confirmWorkDelete.set(work)">Borrar</button>
                </li>
              }
            </ul>
          }
        </div>
      } @else if (!store.works().length) {
        <!-- Sin trabajos: vista previa ilustrativa según el plan (desaparece con el primer trabajo real). -->
        <app-portfolio-preview [proLimit]="store.maxWorks()" [pro]="true" [busy]="store.busy()" (create)="openForm(null)" />
      } @else {
        @if (store.archivedWorks().length) {
          <p class="mt-3 rounded-lg bg-sand-light px-3 py-2 text-[14px] text-ink-soft" data-testid="work-archived-copy">
            {{ store.archivedWorks().length }}
            {{ store.archivedWorks().length === 1 ? 'trabajo sigue guardado y archivado' : 'trabajos siguen guardados y archivados' }}
            por tu plan: no se ven en tu perfil, pero no se borró nada.
          </p>
        }
        <ul class="mt-4 grid gap-4" role="list" data-testid="work-list">
          @for (work of store.works(); track work.id) {
            <li>
              <article
                class="rounded-xl border border-line-soft p-4"
                [class.bg-sand-light]="work.archivedByPlan"
                [attr.aria-labelledby]="'work-title-' + work.id"
                [attr.aria-busy]="store.busyId() === work.id"
                [attr.data-work]="work.id"
              >
                <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div class="min-w-0 flex-1">
                    <h3 [id]="'work-title-' + work.id" class="text-[16px] leading-6 font-bold break-words">{{ work.title }}</h3>
                    <p class="text-[14px] text-muted">
                      {{ monthLabel(work.doneOn) }} · {{ work.photos.length }} de {{ store.photosPerWork() }} fotos
                    </p>
                    @if (work.description) {
                      <p class="mt-1 text-[14px] leading-snug text-ink-soft">{{ work.description }}</p>
                    }
                  </div>
                  <div class="flex items-center gap-0.5">
                    <button
                      type="button"
                      class="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-sand disabled:opacity-35"
                      [disabled]="store.busy()"
                      [attr.aria-label]="'Editar el trabajo ' + work.title"
                      appTooltip="Editar trabajo"
                      (click)="openForm(work)"
                    >
                      <app-icon name="pencil" [size]="15" />
                    </button>
                    <button
                      type="button"
                      class="grid size-11 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-35"
                      [disabled]="store.busy()"
                      [attr.aria-label]="'Borrar el trabajo ' + work.title"
                      appTooltip="Borrar trabajo"
                      (click)="confirmWorkDelete.set(work)"
                    >
                      <app-icon name="trash" [size]="15" />
                    </button>
                  </div>
                </div>

                @if (!work.archivedByPlan && pro.plan()?.entitlements?.canPinWorks) {
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button type="button" class="button-secondary min-h-11 rounded-xl px-3 text-sm font-semibold" [disabled]="store.busy()" [attr.aria-pressed]="!!work.pinned" (click)="store.updateWork(work.id, { pinned: !work.pinned })">{{ work.pinned ? 'Quitar de los fijados' : 'Fijar al principio' }}</button>
                    @if (work.photos.length >= 2) {
                      <button type="button" class="button-secondary min-h-11 rounded-xl px-3 text-sm font-semibold" [disabled]="store.busy()" (click)="openComparison(work)">Antes y después</button>
                    }
                  </div>
                }
                @if (work.archivedByPlan) {
                  <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="work-archived">
                    <p class="min-w-0 flex-1 text-[14px] text-ink-soft">
                      <span class="font-semibold text-ink">Archivado por tu plan.</span>
                      Podés volver a mostrarlo en tu perfil.
                    </p>
                    <button
                      type="button"
                      class="button-secondary inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-[14px] font-semibold disabled:opacity-60"
                      [disabled]="store.busy()"
                      (click)="store.restoreWork(work.id)"
                    >
                      Mostrar este trabajo
                    </button>
                  </div>
                }

                <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="list" [attr.aria-label]="'Fotos de ' + work.title">
                  @for (photo of work.photos; track photo.id; let i = $index, first = $first) {
                    <li
                      class="flex flex-col"
                      [class.opacity-60]="store.busyId() === photo.id || photo.archivedByPlan"
                      [attr.aria-busy]="store.busyId() === photo.id"
                    >
                      <span class="relative block">
                        <img
                          [src]="photo.url"
                          [alt]="photo.caption ?? work.title + ', foto ' + (i + 1)"
                          loading="lazy"
                          decoding="async"
                          class="aspect-[4/3] w-full rounded-xl bg-sand object-cover"
                        />
                        @if (photo.archivedByPlan) {
                          <span class="absolute top-2 left-2 rounded-full bg-sand px-2.5 py-1 text-[13px] font-semibold text-ink-soft">Archivada</span>
                        } @else if (first) {
                          <span
                            class="absolute top-2 left-2 rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold text-brand-dark"
                            data-testid="work-cover"
                            >Portada</span
                          >
                        }
                      </span>
                      <p class="mt-1.5 line-clamp-2 min-h-5 text-[14px] leading-snug" [class]="photo.caption ? 'text-ink-soft' : 'text-muted italic'">
                        {{ photo.caption ?? 'Sin descripción' }}
                      </p>
                      <button
                        type="button"
                        class="mt-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-[14px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-35"
                        [disabled]="store.busy()"
                        [attr.aria-label]="'Editar la foto ' + (i + 1) + ' de ' + work.title"
                        (click)="openPhoto(work, photo)"
                      >
                        <app-icon name="pencil" [size]="14" />Editar foto
                      </button>
                    </li>
                  }
                  @if (store.hasRoom(work)) {
                    <li>
                      <button
                        type="button"
                        [id]="'work-add-' + work.id"
                        class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-dash px-2 text-center text-[14px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-60"
                        [disabled]="store.busy()"
                        (click)="pick(work)"
                        [attr.aria-label]="'Agregar foto a ' + work.title"
                        data-testid="work-add"
                      >
                        <app-icon name="plus" [size]="20" [stroke]="2.2" />{{ work.photos.length ? 'Agregar foto' : 'Agregar la primera foto' }}
                      </button>
                    </li>
                  }
                </ul>

                @if (store.upload(); as up) {
                  @if (up.workId === work.id) {
                    <div class="mt-3 flex items-center gap-3">
                      @if (up.phase === 'uploading') {
                        <div
                          class="h-1.5 w-32 overflow-hidden rounded-full bg-track"
                          role="progressbar"
                          aria-label="Subida de la foto"
                          [attr.aria-valuenow]="up.progress"
                          aria-valuemin="0"
                          aria-valuemax="100"
                        >
                          <div class="h-full rounded-full bg-brand transition-[width] duration-150" [style.width.%]="up.progress"></div>
                        </div>
                      }
                      <p class="text-[14px] text-muted" role="status">{{ phaseText() }}</p>
                    </div>
                  }
                }
                @if (errorFor(work.id); as err) {
                  <p class="mt-3 text-[14px] text-danger" role="alert" data-testid="work-error">{{ err }}</p>
                }
              </article>
            </li>
          }
        </ul>

        @if (store.canCreate()) {
          <button
            type="button"
            class="button-secondary mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4.5 text-[14.5px] font-semibold disabled:opacity-60"
            [disabled]="store.busy()"
            (click)="openForm(null)"
            data-testid="work-create"
          >
            <app-icon name="plus" [size]="17" [stroke]="2.2" />Nuevo trabajo
          </button>
        } @else if (store.isFree()) {
          <div class="mt-4 rounded-xl bg-sand-light px-4 py-3.5" data-testid="work-full">
            <p class="text-[14px] font-medium text-ink-soft">
              Publicar trabajos con fotos requiere PRO. Con Resuelve PRO podés mostrar hasta {{ proLimit }} trabajos.
            </p>
            <a
              routerLink="/pro/plan"
              class="mt-2 inline-flex min-h-10 items-center rounded-lg px-2 text-[14px] font-semibold text-brand underline-offset-3 hover:underline"
              >Conocer PRO</a
            >
          </div>
        } @else {
          <p class="mt-4 text-[14px] font-medium text-ink-soft" data-testid="work-full">
            Tu plan muestra hasta {{ store.maxWorks() }} trabajos. Podés administrar los que ya subiste o ver los otros planes en Mi plan.
          </p>
        }
      }

      @if (errorFor(null); as err) {
        <p class="mt-3 text-[14px] text-danger" role="alert" data-testid="work-error">{{ err }}</p>
      }
      @if (!store.isFree()) {
      <p class="mt-3 text-[14px] leading-[1.45] text-muted">
        JPG, PNG o WebP de hasta 8 MB. Son públicas: no subas fotos ni pongas nombres con datos de clientes, direcciones ni
        teléfonos.
      </p>
      }
    </section>

    <app-dialog [open]="!!comparison()" labelledBy="comparison-title" [dismissable]="!store.busy()" (dismiss)="comparison.set(null)">
      @if (comparison(); as w) {
        <h2 id="comparison-title" class="text-xl font-bold">Antes y después</h2>
        <p class="mt-2 text-sm text-muted">Elegí dos fotos de {{ w.title }}. Se muestran juntas en tu perfil.</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          @for (side of ['before', 'after']; track side) {
            <div><label [for]="'comparison-' + side" class="block text-sm font-semibold">{{ side === 'before' ? 'Antes' : 'Después' }}</label>
            <select [id]="'comparison-' + side" class="field-control mt-1 min-h-11 w-full rounded-xl px-3" [value]="side === 'before' ? before() : after()" (change)="side === 'before' ? before.set($any($event.target).value) : after.set($any($event.target).value)">
              <option value="">Sin selección</option>
              @for (p of w.photos; track p.id; let i = $index) { @if (!p.archivedByPlan) { <option [value]="p.id">Foto {{ i + 1 }}{{ p.caption ? ': ' + p.caption : '' }}</option> } }
            </select></div>
          }
        </div>
        @if (errorFor(w.id); as err) { <p role="alert" class="mt-3 text-sm text-danger">{{ err }}</p> }
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" class="button-primary min-h-11 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="store.busy() || !before() || !after() || before() === after()" (click)="saveComparison()">Guardar comparación</button>
          <button type="button" class="button-secondary min-h-11 rounded-xl px-4" [disabled]="store.busy()" (click)="before.set(''); after.set(''); saveComparison()">Quitar comparación</button>
        </div>
      }
    </app-dialog>
    <!-- Crear o editar un trabajo -->
    <app-dialog [open]="formOpen()" labelledBy="work-form-title" [dismissable]="!store.busyId()" (dismiss)="closeForm()">
      <form novalidate (submit)="$event.preventDefault(); submitForm()" data-testid="work-form">
        <h2 id="work-form-title" class="font-sans text-[22px] font-bold tracking-[-0.02em]">
          {{ editing() ? 'Editar trabajo' : 'Nuevo trabajo' }}
        </h2>
        <label for="work-form-name" class="mt-4 block text-[14.5px] font-semibold">Nombre del trabajo</label>
        <input
          id="work-form-name"
          type="text"
          class="mt-1.5 h-12 w-full rounded-xl field-control px-3.5 text-[15px]"
          [attr.maxlength]="maxTitle"
          placeholder="Ej: Casa 1, Departamento centro"
          autocomplete="off"
          [value]="title()"
          (input)="title.set($any($event.target).value)"
          aria-describedby="work-form-name-hint"
          [attr.aria-invalid]="formField() === 'title'"
        />
        <p id="work-form-name-hint" class="mt-1 text-[13.5px] text-muted">Sin direcciones ni nombres de clientes.</p>

        <fieldset class="mt-4">
          <legend class="text-[14.5px] font-semibold">¿Cuándo lo hiciste?</legend>
          <div class="mt-1.5 grid grid-cols-2 gap-2.5">
            <div>
              <label for="work-month" class="sr-only">Mes</label>
              <select
                id="work-month"
                class="h-12 w-full rounded-xl field-control px-3 text-[15px]"
                [value]="month()"
                (change)="month.set($any($event.target).value)"
                [attr.aria-invalid]="formField() === 'doneOn'"
              >
                @for (m of months; track m.value) {
                  <option [value]="m.value" [selected]="m.value === month()">{{ m.label }}</option>
                }
              </select>
            </div>
            <div>
              <label for="work-year" class="sr-only">Año</label>
              <select
                id="work-year"
                class="h-12 w-full rounded-xl field-control px-3 text-[15px]"
                [value]="year()"
                (change)="year.set($any($event.target).value)"
                [attr.aria-invalid]="formField() === 'doneOn'"
              >
                @for (y of years; track y) {
                  <option [value]="y" [selected]="y === year()">{{ y }}</option>
                }
              </select>
            </div>
          </div>
        </fieldset>

        <label for="work-description" class="mt-4 block text-[14.5px] font-semibold"
          >Descripción <span class="font-normal text-muted">(opcional)</span></label
        >
        <textarea
          id="work-description"
          rows="2"
          class="mt-1.5 w-full rounded-xl field-control px-3.5 py-2.5 text-[15px]"
          [attr.maxlength]="maxDescription"
          placeholder="Ej: Baño completo: cañerías nuevas y porcelanato"
          [value]="description()"
          (input)="description.set($any($event.target).value)"
          aria-describedby="work-description-count"
          [attr.aria-invalid]="formField() === 'description'"
        ></textarea>
        <p id="work-description-count" class="mt-1 text-right text-[13px] text-muted">{{ description().length }}/{{ maxDescription }}</p>

        @if (formError(); as err) {
          <p class="mt-2 text-[14px] text-danger" role="alert" data-testid="work-form-error">{{ err }}</p>
        }
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl button-secondary px-5 text-[15px] font-semibold text-ink" [disabled]="!!store.busyId()" (click)="closeForm()">
            Cancelar
          </button>
          <button
            type="submit"
            class="button-primary flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-70"
            [disabled]="!!store.busyId()"
            data-testid="work-form-submit"
          >
            {{ editing() ? 'Guardar cambios' : 'Crear trabajo' }}
          </button>
        </div>
      </form>
    </app-dialog>

    <!-- Editar una foto: descripción, portada, orden, pasar a otro trabajo y borrar -->
    <app-dialog [open]="!!editingPhoto()" labelledBy="work-photo-title" [dismissable]="!store.busyId()" (dismiss)="closePhoto()">
      @if (editingPhoto(); as ep) {
        <div data-testid="work-photo-dialog">
          <h2 id="work-photo-title" class="font-sans text-[22px] font-bold tracking-[-0.02em] break-words">
            @switch (photoMode()) {
              @case ('move') {
                Pasar la foto a otro trabajo
              }
              @case ('delete') {
                ¿Borrar esta foto?
              }
              @default {
                Foto {{ ep.index + 1 }} de {{ ep.work.photos.length }}
              }
            }
          </h2>
          <p class="mt-0.5 text-[14px] text-muted break-words">{{ ep.work.title }}</p>
          <img
            [src]="ep.photo.url"
            [alt]="ep.photo.caption ?? ep.work.title + ', foto ' + (ep.index + 1)"
            class="mt-3 max-h-[32dvh] w-full rounded-xl bg-sand object-contain"
          />

          @switch (photoMode()) {
            @case ('move') {
              <p class="mt-3 text-[14.5px] text-ink-soft">Queda al final del trabajo que elijas.</p>
              <ul class="mt-3 grid gap-2" role="list">
                @for (target of targetsFor(ep.work); track target.id) {
                  <li>
                    <button
                      type="button"
                      class="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-left hover:bg-sand-light disabled:opacity-60"
                      [disabled]="!!store.busyId()"
                      (click)="moveTo(ep.work, ep.photo, target)"
                    >
                      <span class="min-w-0">
                        <span class="block font-semibold break-words">{{ target.title }}</span>
                        <span class="block text-[13.5px] text-muted">{{ monthLabel(target.doneOn) }} · {{ target.photos.length }} de {{ store.photosPerWork() }} fotos</span>
                      </span>
                      <app-icon name="arrow-right" [size]="16" />
                    </button>
                  </li>
                }
              </ul>
              <div class="mt-5 flex justify-end">
                <button type="button" class="h-12 rounded-xl button-secondary px-5 text-[15px] font-semibold text-ink" (click)="photoMode.set('main')">Volver</button>
              </div>
            }
            @case ('delete') {
              <p class="mt-3 text-[14.5px] text-ink-soft">Se quita de tu perfil público. Podés subir otra cuando quieras.</p>
              <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" class="h-12 rounded-xl button-secondary px-5 text-[15px] font-semibold text-ink" [disabled]="!!store.busyId()" (click)="photoMode.set('main')">
                  Cancelar
                </button>
                <button
                  type="button"
                  class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press"
                  [disabled]="!!store.busyId()"
                  (click)="removePhoto(ep.work, ep.photo)"
                  data-testid="work-delete-confirm"
                >
                  @if (store.busyId()) {
                    <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>Borrando…
                  } @else {
                    Borrar foto
                  }
                </button>
              </div>
            }
            @default {
              <form class="mt-4" novalidate (submit)="$event.preventDefault(); saveCaption(ep.work, ep.photo)">
                <label class="block text-[14.5px] font-semibold" for="work-photo-caption"
                  >Descripción <span class="font-normal text-muted">(opcional)</span></label
                >
                <div class="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="work-photo-caption"
                    type="text"
                    class="h-12 w-full min-w-0 rounded-xl field-control px-3.5 text-[15px] sm:flex-1"
                    [attr.maxlength]="maxCaption"
                    placeholder="Ej: Antes de empezar"
                    [value]="draft()"
                    (input)="draft.set($any($event.target).value)"
                    aria-describedby="work-photo-caption-count"
                  />
                  <button
                    type="submit"
                    class="button-secondary h-12 shrink-0 rounded-xl px-4 text-[14.5px] font-semibold disabled:opacity-60"
                    [disabled]="store.busy() || draft().trim() === (ep.photo.caption ?? '')"
                  >
                    Guardar descripción
                  </button>
                </div>
                <p id="work-photo-caption-count" class="mt-1 text-[13px] text-muted">{{ draft().length }}/{{ maxCaption }}</p>
              </form>

              @if (photoError(); as err) {
                <p class="mt-2 text-[14px] text-danger" role="alert" data-testid="work-photo-error">{{ err }}</p>
              }

              <div class="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Orden de la foto">
                @if (ep.photo.archivedByPlan) {
                  <button
                    type="button"
                    class="button-secondary col-span-2 min-h-11 rounded-xl px-3 text-[14.5px] font-semibold disabled:opacity-40"
                    [disabled]="store.busy() || ep.work.archivedByPlan || activeIn(ep.work) >= store.photosPerWork()"
                    (click)="store.restorePhoto(ep.work.id, ep.photo.id)"
                  >
                    Reactivar foto
                  </button>
                } @else {
                  <button
                    type="button"
                    class="button-secondary col-span-2 min-h-11 rounded-xl px-3 text-[14.5px] font-semibold disabled:opacity-40"
                    [disabled]="store.busy() || ep.index === 0"
                    (click)="store.setCover(ep.work.id, ep.photo.id)"
                  >
                    {{ ep.index === 0 ? 'Es la portada del trabajo' : 'Usar como portada' }}
                  </button>
                }
                <button
                  type="button"
                  class="button-secondary inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-[14.5px] font-semibold disabled:opacity-40"
                  [disabled]="store.busy() || ep.index === 0"
                  (click)="store.move(ep.work.id, ep.photo.id, -1)"
                >
                  <app-icon name="chevron-left" [size]="16" [stroke]="2.2" />Mover antes
                </button>
                <button
                  type="button"
                  class="button-secondary inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-[14.5px] font-semibold disabled:opacity-40"
                  [disabled]="store.busy() || ep.index === ep.work.photos.length - 1"
                  (click)="store.move(ep.work.id, ep.photo.id, 1)"
                >
                  Mover después<app-icon name="chevron-right" [size]="16" [stroke]="2.2" />
                </button>
              </div>

              <div class="mt-5 flex flex-col-reverse gap-2 border-t border-line-soft pt-4 sm:flex-row sm:items-center">
                <button
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[14.5px] font-semibold text-danger hover:bg-danger-soft disabled:opacity-40"
                  [disabled]="store.busy()"
                  (click)="photoMode.set('delete')"
                >
                  <app-icon name="trash" [size]="15" />Borrar foto
                </button>
                <span class="hidden flex-1 sm:block"></span>
                @if (targetsFor(ep.work).length) {
                  <button
                    type="button"
                    class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-[14.5px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-40"
                    [disabled]="store.busy()"
                    (click)="photoMode.set('move')"
                  >
                    <app-icon name="swap" [size]="15" />Pasar a otro trabajo
                  </button>
                }
                <button type="button" class="button-primary min-h-11 rounded-xl px-5 text-[14.5px] font-semibold" (click)="closePhoto()">Listo</button>
              </div>
            }
          }
        </div>
      }
    </app-dialog>

    <!-- Borrar un trabajo -->
    <app-dialog
      [open]="!!confirmWorkDelete()"
      labelledBy="work-remove-title"
      describedBy="work-remove-text"
      [dismissable]="!store.busyId()"
      (dismiss)="confirmWorkDelete.set(null)"
    >
      @if (confirmWorkDelete(); as w) {
        <h2 id="work-remove-title" class="font-sans text-[22px] font-bold tracking-[-0.02em] break-words">¿Borrar «{{ w.title }}»?</h2>
        <p id="work-remove-text" class="mt-2 text-[14.5px] text-ink-soft">
          @if (w.photos.length) {
            Se borran el trabajo y {{ w.photos.length === 1 ? 'su foto' : 'sus ' + w.photos.length + ' fotos' }}. No se puede deshacer.
          } @else {
            Se borra el trabajo. No se puede deshacer.
          }
        </p>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl button-secondary px-5 text-[15px] font-semibold text-ink" [disabled]="!!store.busyId()" (click)="confirmWorkDelete.set(null)">
            Cancelar
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press"
            [disabled]="!!store.busyId()"
            (click)="removeWork()"
            data-testid="work-remove-confirm"
          >
            @if (store.busyId()) {
              <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span>Borrando…
            } @else {
              Borrar trabajo
            }
          </button>
        </div>
      }
    </app-dialog>
  `,
})
export class WorkPhotosEditor implements OnInit {
  protected readonly pro = inject(ProStore);
  protected readonly comparison = signal<Work | null>(null);
  protected readonly before = signal('');
  protected readonly after = signal('');

  protected openComparison(work: Work): void {
    this.before.set(work.beforePhotoId ?? '');
    this.after.set(work.afterPhotoId ?? '');
    this.comparison.set(work);
  }

  protected async saveComparison(): Promise<void> {
    const work = this.comparison();
    if (!work) return;
    if (await this.store.updateWork(work.id, { beforePhotoId: this.before() || null, afterPhotoId: this.after() || null })) this.comparison.set(null);
  }

  protected readonly store = inject(WorkPhotosStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly accept = WORK_PHOTO_MIME_TYPES.join(',');
  protected readonly maxCaption = MAX_CAPTION_LENGTH;
  protected readonly maxTitle = MAX_WORK_TITLE_LENGTH;
  protected readonly maxDescription = MAX_WORK_DESCRIPTION_LENGTH;
  protected readonly proLimit = PRO_WORK_LIMIT;
  protected readonly perWork = PHOTOS_PER_WORK;
  protected readonly messages = WORK_PHOTO_MESSAGES;
  protected readonly monthLabel = workMonthLabel;
  protected readonly months = MONTHS.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));
  protected readonly years: string[] = (() => {
    const last = Number(currentWorkMonth().slice(0, 4));
    return Array.from({ length: last - MIN_WORK_YEAR + 1 }, (_, i) => String(last - i));
  })();

  protected readonly draft = signal('');
  protected readonly confirmWorkDelete = signal<Work | null>(null);

  // Foto en edición: se lee siempre del store (después de ordenar, sigue siendo la misma foto).
  private readonly photoTarget = signal<{ workId: string; photoId: string } | null>(null);
  protected readonly photoMode = signal<'main' | 'move' | 'delete'>('main');
  protected readonly editingPhoto = computed(() => {
    const target = this.photoTarget();
    const work = target ? this.store.works().find((w) => w.id === target.workId) : undefined;
    const index = work ? work.photos.findIndex((p) => p.id === target!.photoId) : -1;
    return work && index >= 0 ? { work, photo: work.photos[index], index } : null;
  });
  protected readonly photoError = computed(() => {
    const err = this.store.error();
    const target = this.photoTarget();
    return err && target && err.workId === target.workId ? err.message : null;
  });

  // Formulario del trabajo (alta o edición).
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Work | null>(null);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly month = signal('01');
  protected readonly year = signal('');
  private readonly localError = signal<{ message: string; field: string } | null>(null);
  protected readonly formField = computed(() => this.localError()?.field ?? null);
  protected readonly formError = computed(() => {
    if (this.localError()) return this.localError()!.message;
    const err = this.store.error();
    const key = this.editing()?.id ?? 'new';
    return err && err.workId === key ? err.message : null;
  });

  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private target: Work | null = null;

  protected readonly phaseText = computed(
    () => ({ signing: 'Preparando…', uploading: 'Subiendo foto…', saving: 'Guardando…' })[this.store.upload()?.phase ?? 'signing'],
  );

  ngOnInit(): void {
    void this.store.load();
  }

  /** Error de un trabajo (fuera del formulario, que muestra el suyo). */
  protected errorFor(workId: string | null): string | null {
    const err = this.store.error();
    if (!err || err.workId !== workId) return null;
    if (this.photoTarget()?.workId === workId) return null;
    if (this.formOpen() && err.workId === (this.editing()?.id ?? 'new')) return null;
    return err.message;
  }

  protected activeIn(work: Work): number {
    return work.photos.filter((p) => !p.archivedByPlan).length;
  }

  /** Otros trabajos activos con lugar, para pasar una foto. */
  protected targetsFor(work: Work): Work[] {
    return this.store.activeWorks().filter((w) => w.id !== work.id && this.store.hasRoom(w));
  }

  protected pick(work: Work): void {
    this.target = work;
    this.file().nativeElement.click();
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file && this.target) await this.store.addPhoto(this.target.id, file);
  }

  protected openForm(work: Work | null): void {
    this.store.error.set(null);
    this.localError.set(null);
    this.editing.set(work);
    const [y, m] = (work?.doneOn ?? currentWorkMonth()).split('-');
    this.title.set(work?.title ?? '');
    this.description.set(work?.description ?? '');
    this.year.set(y);
    this.month.set(m);
    this.formOpen.set(true);
    queueMicrotask(() => document.getElementById('work-form-name')?.focus());
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected async submitForm(): Promise<void> {
    const title = this.title().trim().replace(/\s+/g, ' ');
    const description = this.description().trim().replace(/\s+/g, ' ');
    const doneOn = `${this.year()}-${this.month()}`;
    this.localError.set(null);
    if (title.length < 2) {
      this.localError.set({ message: 'Poné un nombre para el trabajo (por ejemplo, "Casa 1").', field: 'title' });
      document.getElementById('work-form-name')?.focus();
      return;
    }
    if (doneOn > currentWorkMonth()) {
      this.localError.set({ message: 'La fecha del trabajo no puede ser futura.', field: 'doneOn' });
      return;
    }
    const input = { title, description: description || null, doneOn };
    const work = this.editing();
    if (work) {
      if (await this.store.updateWork(work.id, input)) this.closeForm();
      return;
    }
    const id = await this.store.createWork(input);
    if (!id) return;
    this.closeForm();
    // El próximo paso natural: sumarle fotos.
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#work-add-${id}`)?.focus());
  }

  protected openPhoto(work: Work, photo: WorkPhoto): void {
    this.store.error.set(null);
    this.draft.set(photo.caption ?? '');
    this.photoMode.set('main');
    this.photoTarget.set({ workId: work.id, photoId: photo.id });
  }

  protected closePhoto(): void {
    this.photoTarget.set(null);
  }

  protected async saveCaption(work: Work, photo: WorkPhoto): Promise<void> {
    await this.store.saveCaption(work.id, photo.id, this.draft());
  }

  protected async moveTo(work: Work, photo: WorkPhoto, target: Work): Promise<void> {
    if (await this.store.moveToWork(work.id, photo.id, target.id)) this.closePhoto();
  }

  protected async removePhoto(work: Work, photo: WorkPhoto): Promise<void> {
    if (await this.store.removePhoto(work.id, photo.id)) this.closePhoto();
  }

  protected async removeWork(): Promise<void> {
    const work = this.confirmWorkDelete();
    if (!work) return;
    await this.store.removeWork(work.id);
    this.confirmWorkDelete.set(null);
  }
}
