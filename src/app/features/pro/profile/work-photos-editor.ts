import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  MAX_CAPTION_LENGTH,
  WORK_PHOTO_MESSAGES,
  WORK_PHOTO_MIME_TYPES,
  WorkPhotosStore,
} from '../../../core/state/work-photos.store';
import { WorkPhoto } from '../../../core/models/professional';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { RouterLink } from '@angular/router';
import { TooltipDirective } from '../../../shared/directives/tooltip.directive';

/**
 * "Trabajos realizados" en /pro/perfil: subir, describir, reordenar
 * y borrar. Disponible en Free y PRO; no es obligatorio ni afecta búsquedas.
 * El máximo lo garantiza el backend; acá solo se anticipa.
 */
@Component({
  selector: 'app-work-photos-editor',
  imports: [Dialog, Icon, RouterLink, TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-2xl border border-line bg-surface p-5"
      aria-labelledby="sec-work"
      data-testid="work-photos-editor"
    >
      <div class="flex items-start gap-3">
        <span
          class="grid size-9 shrink-0 place-items-center rounded-lg bg-sand text-ink-soft"
          aria-hidden="true"
          ><app-icon name="camera" [size]="17" [stroke]="1.9"
        /></span>
        <div class="min-w-0 flex-1">
          <h2 id="sec-work" class="text-[17px] leading-6 font-bold">Trabajos realizados</h2>
          <p class="text-[14px] text-muted">
            Mostrá tus trabajos para que los clientes conozcan lo que hacés.
          </p>
        </div>
        @if (store.storedCount()) {
          <span
            class="shrink-0 pt-0.5 text-[14px] font-semibold text-ink-soft"
            data-testid="work-count"
            >{{ store.count() }} de {{ store.max() }}</span
          >
        }
      </div>
      @if (store.archivedCount()) {
        <p
          class="mt-2 rounded-lg bg-sand-light px-3 py-2 text-[14px] text-ink-soft"
          data-testid="work-archived-copy"
        >
          {{ store.archivedCount() }}
          {{
            store.archivedCount() === 1
              ? 'foto sigue guardada y archivada por tu plan.'
              : 'fotos siguen guardadas y archivadas por tu plan.'
          }}
          Podés reactivarlas cuando tengas lugar.
        </p>
      }

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
          <button
            type="button"
            class="ml-1 font-semibold text-ink underline underline-offset-2"
            (click)="store.load()"
          >
            Reintentar
          </button>
        </p>
      } @else if (!store.loaded()) {
        <div
          class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          role="status"
        >
          <span class="sr-only">Cargando tus fotos…</span>
          @for (i of [1, 2, 3]; track i) {
            <span class="shimmer aspect-[4/3] rounded-xl" aria-hidden="true"></span>
          }
        </div>
      } @else if (!store.storedCount()) {
        <div
          class="mt-4 rounded-xl border border-dashed border-line-dash p-6 text-center"
          data-testid="work-empty"
        >
          <p class="text-[15px] font-semibold text-ink">
            Mostrá algunos trabajos que hayas realizado.
          </p>
          <p class="mt-1 text-[14px] text-muted">
            Podés mostrar hasta {{ store.max() }} fotos activas.
          </p>
          <button
            type="button"
            class="button-primary mt-4 inline-flex h-11 items-center gap-2 rounded-xl px-4.5 text-[14.5px] font-semibold disabled:opacity-60"
            [disabled]="store.busy()"
            (click)="pick()"
          >
            <app-icon name="plus" [size]="17" [stroke]="2.2" />Agregar primera foto
          </button>
        </div>
      } @else {
        <ul
          class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          role="list"
          data-testid="work-list"
        >
          @for (
            photo of store.items();
            track photo.id;
            let i = $index, first = $first, last = $last
          ) {
            <li
              class="flex flex-col"
              [class.opacity-60]="store.busyId() === photo.id || photo.archivedByPlan"
              [attr.aria-busy]="store.busyId() === photo.id"
            >
              <img
                [src]="photo.url"
                [alt]="photo.caption ?? 'Trabajo ' + (i + 1)"
                loading="lazy"
                decoding="async"
                class="aspect-[4/3] w-full rounded-xl bg-sand object-cover"
              />
              @if (photo.archivedByPlan) {
                <span
                  class="mt-1.5 self-start rounded-full bg-sand px-2.5 py-1 text-[14px] font-semibold text-ink-soft"
                  >Archivada por plan</span
                >
              } @else if (photo.featured) {
                <span
                  class="mt-1.5 self-start rounded-full bg-brand-soft px-2.5 py-1 text-[14px] font-semibold text-brand-dark"
                  >Foto principal</span
                >
              }
              @if (editingId() === photo.id) {
                <form
                  class="mt-2"
                  novalidate
                  (submit)="$event.preventDefault(); saveCaption(photo)"
                >
                  <label class="sr-only" [attr.for]="'caption-' + photo.id"
                    >Descripción de la foto {{ i + 1 }}</label
                  >
                  <input
                    [id]="'caption-' + photo.id"
                    type="text"
                    class="h-10 w-full rounded-lg field-control px-3 text-[14px] focus:"
                    [attr.maxlength]="maxCaption"
                    placeholder="Ej: Baño completo en porcelanato"
                    [value]="draft()"
                    (input)="draft.set($any($event.target).value)"
                    (keydown.escape)="cancelCaption()"
                    [attr.aria-describedby]="'caption-count-' + photo.id"
                  />
                  <div class="mt-1.5 flex items-center justify-between gap-2">
                    <span [id]="'caption-count-' + photo.id" class="text-[14px] text-muted"
                      >{{ draft().length }}/{{ maxCaption }}</span
                    >
                    <span class="flex gap-1">
                      <button
                        type="button"
                        class="h-8 rounded-lg px-2.5 text-[14px] font-semibold text-ink-soft hover:bg-sand"
                        (click)="cancelCaption()"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        class="button-primary h-8 rounded-lg px-2.5 text-[14px] font-semibold disabled:opacity-60"
                        [disabled]="store.busy()"
                      >
                        Guardar
                      </button>
                    </span>
                  </div>
                </form>
              } @else {
                <p
                  class="mt-1.5 line-clamp-2 min-h-5 text-[14px] leading-snug"
                  [class]="photo.caption ? 'text-ink-soft' : 'text-muted italic'"
                >
                  {{ photo.caption ?? 'Sin descripción' }}
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-0.5">
                  @if (photo.archivedByPlan) {
                    <button
                      type="button"
                      class="min-h-11 rounded-lg px-2.5 text-[14px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-35"
                      [disabled]="store.busy() || store.count() >= store.max()"
                      (click)="store.restore(photo.id)"
                      [attr.aria-label]="'Reactivar foto ' + (i + 1)"
                    >
                      Reactivar
                    </button>
                  } @else if (!photo.featured) {
                    <button
                      type="button"
                      class="min-h-11 rounded-lg px-2.5 text-[14px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-35"
                      [disabled]="store.busy()"
                      (click)="store.setFeatured(photo.id, true)"
                      [attr.aria-label]="'Marcar foto ' + (i + 1) + ' como principal'"
                    >
                      Destacar
                    </button>
                  }
                  <button
                    type="button"
                    class="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-sand disabled:opacity-35"
                    [disabled]="first || store.busy()"
                    [attr.aria-label]="'Mover la foto ' + (i + 1) + ' antes'"
                    appTooltip="Mover antes"
                    (click)="store.move(photo.id, -1)"
                  >
                    <app-icon name="chevron-left" [size]="17" [stroke]="2.2" />
                  </button>
                  <button
                    type="button"
                    class="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-sand disabled:opacity-35"
                    [disabled]="last || store.busy()"
                    [attr.aria-label]="'Mover la foto ' + (i + 1) + ' después'"
                    appTooltip="Mover despu?s"
                    (click)="store.move(photo.id, 1)"
                  >
                    <app-icon name="chevron-right" [size]="17" [stroke]="2.2" />
                  </button>
                  <button
                    type="button"
                    class="grid size-11 place-items-center rounded-lg text-ink-soft hover:bg-sand disabled:opacity-35"
                    [disabled]="store.busy()"
                    [attr.aria-label]="
                      (photo.caption ? 'Editar la descripción' : 'Agregar descripción') +
                      ' de la foto ' +
                      (i + 1)
                    "
                    appTooltip="Editar descripci?n"
                    (click)="editCaption(photo)"
                  >
                    <app-icon name="pencil" [size]="15" />
                  </button>
                  <button
                    type="button"
                    class="ml-auto grid size-11 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-35"
                    [disabled]="store.busy()"
                    [attr.aria-label]="'Borrar la foto ' + (i + 1)"
                    appTooltip="Borrar foto"
                    (click)="confirmDelete.set(photo)"
                  >
                    <app-icon name="trash" [size]="15" />
                  </button>
                </div>
              }
            </li>
          }
          @if (!store.full()) {
            <li>
              <button
                type="button"
                class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-dash text-[14px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-60"
                [disabled]="store.busy()"
                (click)="pick()"
                data-testid="work-add"
              >
                <app-icon name="plus" [size]="20" [stroke]="2.2" />Agregar foto
              </button>
            </li>
          }
        </ul>
        @if (store.full()) {
          @if (store.max() === 5 && store.count() >= store.max()) {
            <div class="mt-3 rounded-xl bg-sand-light px-4 py-3.5" data-testid="work-full">
              <p class="text-[14px] font-medium text-ink-soft">
                Alcanzaste el límite de 5 fotos de Free. Con PRO podés mostrar hasta 20.
              </p>
              <a
                routerLink="/pro/plan"
                class="mt-2 inline-flex min-h-10 items-center rounded-lg px-2 text-[14px] font-semibold text-brand underline-offset-3 hover:underline"
                >Conocer PRO</a
              >
            </div>
          } @else if (store.storedFull()) {
            <p class="mt-3 text-[14px] font-medium text-ink-soft" data-testid="work-full">
              Guardaste el máximo de {{ store.maxStored() }} fotos del portfolio.
            </p>
          } @else {
            <p class="mt-3 text-[14px] font-medium text-ink-soft" data-testid="work-full">
              Ya alcanzaste el máximo de {{ store.max() }} fotos activas.
            </p>
          }
        }
      }

      @if (store.upload(); as up) {
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
              <div
                class="h-full rounded-full bg-brand transition-[width] duration-150"
                [style.width.%]="up.progress"
              ></div>
            </div>
          }
          <p class="text-[14px] text-muted" role="status">{{ phaseText() }}</p>
        </div>
      }
      @if (store.error(); as err) {
        <p class="mt-3 text-[14px] text-danger" role="alert" data-testid="work-error">{{ err }}</p>
      }
      <p class="mt-3 text-[14px] leading-[1.45] text-muted">
        JPG, PNG o WebP de hasta 8 MB. Son públicas: no subas fotos con datos de clientes,
        direcciones ni teléfonos.
      </p>
    </section>

    <app-dialog
      [open]="!!confirmDelete()"
      labelledBy="work-delete-title"
      describedBy="work-delete-text"
      [dismissable]="!store.busyId()"
      (dismiss)="confirmDelete.set(null)"
    >
      <h2 id="work-delete-title" class="font-sans text-[22px] font-bold tracking-[-0.02em]">
        ¿Borrar esta foto?
      </h2>
      <p id="work-delete-text" class="mt-2 text-[14.5px] text-ink-soft">
        Se quita de tu perfil público. Podés subir otra cuando quieras.
      </p>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="h-12 rounded-xl button-secondary px-5 text-[15px] font-semibold text-ink"
          [disabled]="!!store.busyId()"
          (click)="confirmDelete.set(null)"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press"
          [disabled]="!!store.busyId()"
          (click)="remove()"
          data-testid="work-delete-confirm"
        >
          @if (store.busyId()) {
            <span
              class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white"
              aria-hidden="true"
            ></span
            >Borrando…
          } @else {
            Borrar foto
          }
        </button>
      </div>
    </app-dialog>
  `,
})
export class WorkPhotosEditor implements OnInit {
  protected readonly store = inject(WorkPhotosStore);
  protected readonly accept = WORK_PHOTO_MIME_TYPES.join(',');
  protected readonly maxCaption = MAX_CAPTION_LENGTH;
  protected readonly messages = WORK_PHOTO_MESSAGES;
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly confirmDelete = signal<WorkPhoto | null>(null);
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected readonly phaseText = computed(
    () =>
      ({ signing: 'Preparando…', uploading: 'Subiendo foto…', saving: 'Guardando…' })[
        this.store.upload()?.phase ?? 'signing'
      ],
  );

  ngOnInit(): void {
    void this.store.load();
  }

  protected pick(): void {
    this.file().nativeElement.click();
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.store.add(file);
  }

  protected editCaption(photo: WorkPhoto): void {
    this.draft.set(photo.caption ?? '');
    this.editingId.set(photo.id);
    queueMicrotask(() => document.getElementById(`caption-${photo.id}`)?.focus());
  }

  protected cancelCaption(): void {
    this.editingId.set(null);
  }

  protected async saveCaption(photo: WorkPhoto): Promise<void> {
    if (await this.store.saveCaption(photo.id, this.draft())) this.editingId.set(null);
  }

  protected async remove(): Promise<void> {
    const photo = this.confirmDelete();
    if (!photo) return;
    await this.store.remove(photo.id);
    this.confirmDelete.set(null);
  }
}
