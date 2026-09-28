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
import { WorkPhoto } from '../../../core/models/professional';
import { Icon } from '../icon/icon';

/**
 * "Trabajos realizados" en el perfil público: grilla editorial en desktop y
 * carrusel con snap horizontal en mobile. Sin fotos (o si ninguna carga) no
 * se muestra nada: nunca una sección vacía.
 *
 * Lightbox sobre `<dialog>` nativo (`showModal()` atrapa el foco): anterior /
 * siguiente con botones, flechas o deslizando; Escape y "Cerrar" cierran y el
 * foco vuelve a la foto que lo abrió.
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
      padding: 0;
      border: 0;
      background: transparent;
      color: #fff;
      overflow: visible;
    }
    dialog::backdrop {
      background: color-mix(in srgb, var(--color-scrim) 88%, transparent);
    }
    dialog[open] {
      animation: lightbox-in 0.2s var(--ease-out-soft) both;
    }
    @keyframes lightbox-in {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      dialog[open] { animation: none; }
    }
  `,
  template: `
    @if (photos().length) {
      <section [attr.aria-labelledby]="headingId()" data-testid="work-gallery">
        <h2 [id]="headingId()" [class]="headingClass()">Trabajos realizados</h2>
        <ul
          class="no-scrollbar mt-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 sm:grid sm:snap-none sm:overflow-visible sm:pb-0"
          [class]="listClass()"
          role="list"
        >
          @for (photo of photos(); track photo.id; let i = $index) {
            <li class="w-[72%] flex-none snap-start sm:w-auto" [class]="i === 0 && photos().length === 5 ? 'sm:col-span-2 sm:row-span-2' : ''">
              <button
                type="button"
                class="group block h-full w-full overflow-hidden rounded-2xl bg-sand text-left press-soft"
                [attr.aria-label]="'Ver foto ' + (i + 1) + ' de ' + photos().length + (photo.caption ? ': ' + photo.caption : '')"
                (click)="open(i, $event)"
              >
                <img
                  [src]="photo.url"
                  [alt]="altFor(photo, i)"
                  loading="lazy"
                  decoding="async"
                  class="aspect-[4/3] h-full w-full object-cover transition-transform duration-300 ease-(--ease-out-soft) group-hover:scale-[1.02]"
                  (error)="failed(photo)"
                />
              </button>
              @if (photo.caption) {
                <p class="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{{ photo.caption }}</p>
              }
            </li>
          }
        </ul>
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
        <div class="flex flex-col gap-3" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
          <div class="flex items-center justify-between gap-3">
            <h2 id="work-lightbox-title" class="text-sm font-semibold text-white/85" aria-live="polite">
              Trabajo {{ (index() ?? 0) + 1 }} de {{ photos().length }}
            </h2>
            <button type="button" class="grid size-11 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" aria-label="Cerrar" (click)="close()">
              <app-icon name="close" [size]="20" [stroke]="2.2" />
            </button>
          </div>
          <div class="relative">
            <img [src]="photo.url" [alt]="altFor(photo, index() ?? 0)" class="mx-auto max-h-[calc(100dvh-200px)] w-auto rounded-2xl object-contain" />
            @if (photos().length > 1) {
              <button type="button" class="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-35" aria-label="Foto anterior" [disabled]="index() === 0" (click)="go(-1)">
                <app-icon name="chevron-left" [size]="22" [stroke]="2.2" />
              </button>
              <button type="button" class="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70 disabled:opacity-35" aria-label="Foto siguiente" [disabled]="index() === photos().length - 1" (click)="go(1)">
                <app-icon name="chevron-right" [size]="22" [stroke]="2.2" />
              </button>
            }
          </div>
          @if (photo.caption) {
            <p class="text-center text-[15px] text-white/90">{{ photo.caption }}</p>
          }
        </div>
      }
    </dialog>
  `,
})
export class WorkGallery {
  readonly items = input.required<WorkPhoto[]>();
  /** Para el texto alternativo ("Trabajo de Juan…"). */
  readonly ownerName = input.required<string>();
  readonly headingId = input('work-gallery-title');
  readonly compact = input(false);

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('lightbox');
  private readonly broken = signal<ReadonlySet<string>>(new Set());
  private opener: HTMLElement | null = null;
  private touchX: number | null = null;

  /** Fotos que cargaron, en su orden. */
  protected readonly photos = computed(() =>
    [...this.items()].sort((a, b) => a.sortOrder - b.sortOrder).filter((p) => !this.broken().has(p.id)),
  );
  protected readonly index = signal<number | null>(null);
  protected readonly current = computed(() => {
    const i = this.index();
    return i === null ? null : (this.photos()[i] ?? null);
  });
  protected readonly headingClass = computed(() =>
    this.compact()
      ? 'font-display text-[19px] font-bold tracking-[-0.02em]'
      : 'font-display text-[22px] font-bold tracking-[-0.02em]',
  );
  /**
   * Desktop: grilla editorial sin huecos. 5 fotos → la primera grande (2×2)
   * y cuatro chicas; con menos, columnas iguales. Mobile: carrusel.
   */
  protected readonly listClass = computed(
    () =>
      ({
        1: 'sm:grid-cols-2 sm:gap-3',
        2: 'sm:grid-cols-2 sm:gap-3',
        3: 'sm:grid-cols-3 sm:gap-3',
        4: 'sm:grid-cols-4 sm:gap-3',
      })[this.photos().length] ?? 'sm:grid-cols-4 sm:grid-rows-2 sm:gap-3',
  );

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (!this.browser) return;
      const openNow = this.current() !== null;
      if (openNow && !el.open) {
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
      } else if (!openNow && el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
        if (this.opener?.isConnected) this.opener.focus();
        this.opener = null;
      }
    });
  }

  protected altFor(photo: WorkPhoto, i: number): string {
    return photo.caption ?? `Trabajo realizado por ${this.ownerName()} (${i + 1} de ${this.photos().length})`;
  }

  protected open(i: number, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.index.set(i);
  }

  protected close(): void {
    this.index.set(null);
  }

  protected go(delta: -1 | 1): void {
    const i = this.index();
    if (i === null) return;
    const next = i + delta;
    if (next >= 0 && next < this.photos().length) this.index.set(next);
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
