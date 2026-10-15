import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Work, WorkPhoto } from '../../../core/models/professional';
import { workMonthLabel } from '../../../core/state/work-photos.store';
import { Icon } from '../icon/icon';

interface ShownWork extends Work {
  label: string;
}

/**
 * "Trabajos realizados" en el perfil público, por trabajo ("Casa 1",
 * "Departamento centro"), del más reciente al más viejo.
 *
 * - Un solo trabajo: su nombre y fecha, y sus fotos en una grilla editorial
 *   (carrusel con snap en mobile).
 * - Varios: una tarjeta por trabajo con su portada (la primera foto), nombre,
 *   fecha y cantidad de fotos; carrusel en mobile, grilla en desktop.
 *
 * Tocar una foto o una tarjeta abre el visor de ESE trabajo sobre `<dialog>`
 * nativo (`showModal()` atrapa el foco): anterior / siguiente con botones,
 * flechas, miniaturas o deslizando; Escape y "Cerrar" cierran y el foco vuelve
 * a lo que lo abrió. Sin fotos (o si ninguna carga) no se muestra nada: nunca
 * una sección vacía.
 */
@Component({
  selector: 'app-work-gallery',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dialog {
      width: min(1040px, calc(100% - 32px));
      max-width: none;
      max-height: calc(100dvh - 32px);
      margin: auto;
      padding: 12px;
      border: 0;
      border-radius: var(--radius-3xl);
      /* Visor de fotos: siempre oscuro (en ambos temas), texto claro encima. */
      background: var(--color-lightbox);
      color: var(--color-on-lightbox);
      overflow: visible;
    }
    dialog:focus-visible {
      outline: none;
    }
    dialog::backdrop {
      background: color-mix(in srgb, var(--color-lightbox) 94%, transparent);
    }
    dialog[open] {
      animation: lightbox-in 0.2s var(--ease-out-soft) both;
    }
    @keyframes lightbox-in {
      from {
        opacity: 0;
        transform: scale(0.98);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open] {
        animation: none;
      }
    }
  `,
  template: `
    @if (shown().length) {
      <section [attr.aria-labelledby]="headingId()" data-testid="work-gallery">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 [id]="headingId()" [class]="headingClass()">Trabajos realizados</h2>
          @if (shown().length > 1) {
            <p class="text-[14px] text-muted" data-testid="work-gallery-summary">
              {{ shown().length }} trabajos · {{ photoTotal() }} fotos
            </p>
          }
        </div>

        @for (work of shown(); track work.id) {
          @if (pair(work); as photos) {
            <figure class="mt-5" data-testid="before-after">
              <figcaption class="mb-2 text-sm font-semibold">{{ work.title }} · Antes y después</figcaption>
              <div class="grid grid-cols-2 gap-2">
                @for (photo of photos; track photo.id; let first = $first) {
                  <div><img [src]="photo.url" [alt]="(first ? 'Antes: ' : 'Después: ') + work.title" class="aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" decoding="async" (error)="failed(photo)" /><p class="mt-1 text-sm text-muted">{{ first ? 'Antes' : 'Después' }}</p></div>
                }
              </div>
            </figure>
          }
        }
        @if (single(); as work) {
          <div class="mt-2">
            <p class="text-[15px] text-ink-soft">
              <strong class="font-semibold text-ink">{{ work.title }}</strong> · {{ work.label }}
            </p>
            @if (work.description) {
              <p class="mt-1 text-[15px] leading-relaxed text-ink-soft">{{ work.description }}</p>
            }
          </div>
          <ul
            class="no-scrollbar mt-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:grid sm:snap-none sm:overflow-visible sm:pb-0"
            [class]="listClass(work.photos.length)"
            role="list"
          >
            @for (photo of work.photos; track photo.id; let i = $index) {
              <li
                class="flex w-[72%] flex-none snap-start flex-col sm:relative sm:w-auto"
                [class]="big(i, work.photos.length) ? 'sm:col-span-2 sm:row-span-2' : 'sm:self-start'"
              >
                <button
                  type="button"
                  class="group block w-full overflow-hidden rounded-2xl bg-sand text-left press-soft"
                  [class]="big(i, work.photos.length) ? 'sm:min-h-0 sm:flex-1' : ''"
                  [attr.aria-label]="'Ver foto ' + (i + 1) + ' de ' + work.photos.length + (photo.caption ? ': ' + photo.caption : '')"
                  (click)="open(work, i, $event)"
                >
                  <img
                    [src]="photo.url"
                    [alt]="altFor(work, photo, i)"
                    loading="lazy"
                    decoding="async"
                    class="aspect-[4/3] w-full object-cover transition-transform duration-300 ease-(--ease-out-soft) group-hover:scale-[1.02] motion-reduce:transform-none"
                    [class]="big(i, work.photos.length) ? 'sm:aspect-auto sm:h-full' : ''"
                    (error)="failed(photo)"
                  />
                </button>
                @if (photo.caption) {
                  <p
                    class="mt-1.5 line-clamp-2 text-[14px] leading-snug text-ink-soft sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:mt-0 sm:rounded-b-2xl sm:bg-linear-to-t sm:from-lightbox/85 sm:to-transparent sm:px-3.5 sm:pt-10 sm:pb-3 sm:text-on-lightbox"
                  >
                    {{ photo.caption }}
                  </p>
                }
              </li>
            }
          </ul>
        } @else {
          <ul
            class="no-scrollbar mt-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:snap-none sm:gap-4 sm:overflow-visible sm:pb-0"
            role="list"
            data-testid="work-cards"
            [id]="headingId() + '-cards'"
          >
            @for (work of shown(); track work.id; let i = $index) {
              <!-- Desktop: los 4 más recientes y "Ver los N trabajos"; mobile: carrusel con todos. -->
              <li class="w-[80%] flex-none snap-start sm:w-auto" [class.sm:hidden]="!expanded() && i >= collapsed">
                <button
                  type="button"
                  class="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left press-soft hover:border-line-dash"
                  [attr.aria-label]="'Ver ' + work.title + ', ' + work.label + ', ' + photoCount(work)"
                  (click)="open(work, 0, $event)"
                  [attr.data-work]="work.id"
                >
                  <span class="relative block overflow-hidden bg-sand">
                    <img
                      [src]="work.photos[0].url"
                      [alt]="work.photos[0].caption ?? work.title + ', trabajo realizado por ' + ownerName()"
                      loading="lazy"
                      decoding="async"
                      class="aspect-[4/3] w-full object-cover transition-transform duration-300 ease-(--ease-out-soft) group-hover:scale-[1.02] motion-reduce:transform-none"
                      (error)="failed(work.photos[0])"
                    />
                    <span
                      class="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-lightbox/75 px-2.5 py-1 text-[13px] font-semibold text-on-lightbox"
                      aria-hidden="true"
                      ><app-icon name="camera" [size]="13" [stroke]="2" />{{ work.photos.length }}</span
                    >
                  </span>
                  <span class="block px-4 pt-3 pb-4">
                    <span class="block text-[16px] leading-snug font-bold break-words text-ink">{{ work.title }}{{ work.pinned ? ' · Fijado' : '' }}</span>
                    <span class="mt-0.5 block text-[14px] text-muted">{{ work.label }}</span>
                    @if (work.description) {
                      <span class="mt-1.5 line-clamp-2 block text-[14px] leading-snug text-ink-soft">{{ work.description }}</span>
                    }
                  </span>
                </button>
              </li>
            }
          </ul>
          @if (shown().length > collapsed) {
            <button
              type="button"
              class="button-secondary mt-4 hidden min-h-11 items-center justify-center gap-1.5 rounded-xl px-4.5 text-[14.5px] font-semibold sm:inline-flex"
              [attr.aria-expanded]="expanded()"
              [attr.aria-controls]="headingId() + '-cards'"
              (click)="expanded.set(!expanded())"
              data-testid="work-cards-toggle"
            >
              {{ expanded() ? 'Ver menos' : 'Ver los ' + shown().length + ' trabajos' }}
              <app-icon [name]="expanded() ? 'chevron-up' : 'chevron-down'" [size]="16" [stroke]="2.2" />
            </button>
          }
        }
      </section>
    }

    <dialog
      #lightbox
      aria-labelledby="work-lightbox-title"
      (cancel)="$event.preventDefault(); close()"
      (click)="onBackdrop($event)"
      (keydown)="onKey($event)"
      data-testid="work-lightbox"
    >
      @if (current(); as photo) {
        @let work = openWork()!;
        <div class="flex flex-col gap-3" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 pl-1" aria-live="polite">
              <h2 id="work-lightbox-title" class="text-[15px] font-semibold break-words">{{ work.title }}</h2>
              <p class="text-[13.5px] opacity-80">Foto {{ (index() ?? 0) + 1 }} de {{ work.photos.length }} · {{ work.label }}</p>
            </div>
            <button
              type="button"
              class="grid size-11 shrink-0 place-items-center rounded-xl bg-on-lightbox/10 hover:bg-on-lightbox/20"
              aria-label="Cerrar"
              (click)="close()"
              data-autofocus
            >
              <app-icon name="close" [size]="20" [stroke]="2.2" />
            </button>
          </div>
          <div class="relative">
            <img
              [src]="photo.url"
              [alt]="altFor(work, photo, index() ?? 0)"
              class="mx-auto max-h-[calc(100dvh-260px)] w-auto rounded-2xl object-contain"
            />
            @if (work.photos.length > 1) {
              <button
                type="button"
                class="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-lightbox/70 text-on-lightbox hover:bg-lightbox/90 disabled:opacity-35"
                aria-label="Foto anterior"
                [disabled]="index() === 0"
                (click)="go(-1)"
              >
                <app-icon name="chevron-left" [size]="22" [stroke]="2.2" />
              </button>
              <button
                type="button"
                class="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-lightbox/70 text-on-lightbox hover:bg-lightbox/90 disabled:opacity-35"
                aria-label="Foto siguiente"
                [disabled]="index() === work.photos.length - 1"
                (click)="go(1)"
              >
                <app-icon name="chevron-right" [size]="22" [stroke]="2.2" />
              </button>
            }
          </div>
          @if (photo.caption) {
            <p class="text-center text-[15px]">{{ photo.caption }}</p>
          }
          @if (work.photos.length > 1) {
            <ul class="flex justify-center gap-2 pb-1" role="list" aria-label="Fotos del trabajo">
              @for (thumb of work.photos; track thumb.id; let i = $index) {
                <li>
                  <button
                    type="button"
                    class="block size-12 overflow-hidden rounded-lg ring-2 ring-offset-0 transition-opacity"
                    [class]="i === index() ? 'opacity-100 ring-on-lightbox' : 'opacity-60 ring-transparent hover:opacity-90'"
                    [attr.aria-label]="'Ver foto ' + (i + 1)"
                    [attr.aria-current]="i === index() ? 'true' : null"
                    (click)="index.set(i)"
                  >
                    <img [src]="thumb.url" alt="" class="size-full object-cover" />
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }
    </dialog>
  `,
})
export class WorkGallery {
  protected pair(work: Work): [WorkPhoto, WorkPhoto] | null {
    const before = work.photos.find((p) => p.id === work.beforePhotoId);
    const after = work.photos.find((p) => p.id === work.afterPhotoId);
    return before && after ? [before, after] : null;
  }

  readonly works = input.required<Work[]>();
  /** Para el texto alternativo ("…, trabajo realizado por Juan"). */
  readonly ownerName = input.required<string>();
  readonly headingId = input('work-gallery-title');
  readonly compact = input(false);

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('lightbox');
  private readonly broken = signal<ReadonlySet<string>>(new Set());
  private opener: HTMLElement | null = null;
  private touchX: number | null = null;

  /** Trabajos con fotos que cargaron, cada una en su orden (la primera es la portada). */
  protected readonly shown = computed<ShownWork[]>(() =>
    this.works()
      .map((work) => ({
        ...work,
        label: workMonthLabel(work.doneOn),
        photos: [...work.photos].sort((a, b) => a.sortOrder - b.sortOrder).filter((p) => !this.broken().has(p.id)),
      }))
      .filter((work) => work.photos.length > 0),
  );
  /** Tarjetas visibles en desktop antes de "Ver los N trabajos". */
  protected readonly collapsed = 4;
  protected readonly expanded = signal(false);
  protected readonly single = computed(() => (this.shown().length === 1 ? this.shown()[0] : null));
  protected readonly photoTotal = computed(() => this.shown().reduce((n, w) => n + w.photos.length, 0));

  private readonly openId = signal<string | null>(null);
  protected readonly index = signal<number | null>(null);
  protected readonly openWork = computed(() => this.shown().find((w) => w.id === this.openId()) ?? null);
  protected readonly current = computed(() => {
    const i = this.index();
    const work = this.openWork();
    return i === null || !work ? null : (work.photos[i] ?? null);
  });
  protected readonly headingClass = computed(() =>
    this.compact()
      ? 'font-display text-[19px] font-bold tracking-[-0.02em]'
      : 'font-display text-[22px] font-bold tracking-[-0.02em]',
  );

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!this.browser) return;
      const openNow = this.current() !== null;
      if (openNow && !el.open) {
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
        queueMicrotask(() => el.querySelector<HTMLElement>('[data-autofocus]')?.focus());
      } else if (!openNow && el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
        if (this.opener?.isConnected) this.opener.focus();
        this.opener = null;
      }
    });
  }

  /**
   * Un trabajo solo: grilla editorial sin huecos. 5 fotos → la portada grande
   * (2×2) y cuatro chicas; con tres, la portada y dos detalles; con dos o
   * cuatro, columnas iguales. Mobile: carrusel.
   */
  protected listClass(count: number): string {
    return (
      ({
        1: 'sm:grid-cols-1',
        2: 'sm:grid-cols-2 sm:gap-3',
        3: 'sm:grid-cols-3 sm:gap-3',
        4: 'sm:grid-cols-2 sm:gap-3',
        5: 'sm:grid-cols-4 sm:gap-3',
      } as Record<number, string>)[count] ?? 'sm:grid-cols-3 sm:gap-3'
    );
  }

  /** La portada va grande con 3 o 5 fotos (completa la grilla sin huecos). */
  protected big(i: number, count: number): boolean {
    return i === 0 && (count === 3 || count === 5);
  }

  protected photoCount(work: Work): string {
    return work.photos.length === 1 ? '1 foto' : `${work.photos.length} fotos`;
  }

  protected altFor(work: Work, photo: WorkPhoto, i: number): string {
    return photo.caption ?? `${work.title}, foto ${i + 1} de ${work.photos.length}, trabajo realizado por ${this.ownerName()}`;
  }

  protected open(work: Work, i: number, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.openId.set(work.id);
    this.index.set(i);
  }

  protected close(): void {
    this.index.set(null);
    this.openId.set(null);
  }

  protected go(delta: -1 | 1): void {
    const i = this.index();
    const work = this.openWork();
    if (i === null || !work) return;
    const next = i + delta;
    if (next >= 0 && next < work.photos.length) this.index.set(next);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.go(-1);
    else if (event.key === 'ArrowRight') this.go(1);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected touchStart(event: TouchEvent): void {
    this.touchX = event.changedTouches[0]?.clientX ?? null;
  }

  protected touchEnd(event: TouchEvent): void {
    const start = this.touchX;
    this.touchX = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined || Math.abs(end - start) < 40) return;
    this.go(end < start ? 1 : -1);
  }

  protected failed(photo: WorkPhoto): void {
    this.broken.update((set) => new Set([...set, photo.id]));
  }
}
