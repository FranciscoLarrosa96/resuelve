import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarSubject } from '../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../core/models/professional';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';

export interface ShowcaseItem {
  pro: ProfessionalSummary;
  avatar: AvatarSubject;
}

const ROTATE_MS = 7000;
/** Tarjetas visibles a la vez en desktop. */
const VISIBLE = 2;

/**
 * Vitrina "Perfiles PRO" del banner del inicio. Espacio promocionado y
 * rotulado como tal: PRO no es verificación, matrícula ni recomendación.
 * Desktop: dos tarjetas que rotan despacio (pausa con hover/foco; sin
 * rotación con "reducir movimiento"). Mobile: lista horizontal deslizable.
 */
@Component({
  selector: 'app-pro-showcase',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Icon, ProBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(mouseenter)': 'paused.set(true)',
    '(mouseleave)': 'paused.set(false)',
    '(focusin)': 'paused.set(true)',
    '(focusout)': 'paused.set(false)',
  },
  template: `
    <div class="flex items-end justify-between gap-3">
      <div>
        <h3 class="flex items-center gap-2 text-[15px] font-semibold text-white">
          <span class="rounded-md border border-white/60 px-1.5 py-px text-[10.5px] leading-4 font-bold tracking-[0.08em]">PRO</span>
          Perfiles con Resuelve PRO
        </h3>
        <p class="mt-1 text-[12.5px] text-on-brand-muted">Espacio promocionado. No es una verificación ni una recomendación.</p>
      </div>
      @if (items().length > visible) {
        <div class="hidden shrink-0 gap-1.5 lg:flex">
          <button type="button" class="grid size-9 place-items-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10" aria-label="Perfiles anteriores" (click)="step(-1)"><app-icon name="chevron-left" [size]="16" [stroke]="2.4" /></button>
          <button type="button" class="grid size-9 place-items-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10" aria-label="Más perfiles" (click)="step(1)"><app-icon name="chevron-right" [size]="16" [stroke]="2.4" /></button>
        </div>
      }
    </div>

    <!-- Desktop: ventana que rota -->
    <ul class="mt-4 hidden gap-3 lg:grid lg:grid-cols-2" aria-live="off" aria-roledescription="carrusel">
      @for (item of window(); track item.pro.id) {
        <li class="animate-fade-in"><ng-container *ngTemplateOutlet="card; context: { $implicit: item }" /></li>
      }
    </ul>
    <!-- Mobile/tablet: deslizable -->
    <ul class="no-scrollbar relative -mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:-mx-8 md:scroll-px-8 md:px-8 lg:hidden">
      @for (item of items(); track item.pro.id) {
        <li class="w-72 flex-none snap-start"><ng-container *ngTemplateOutlet="card; context: { $implicit: item }" /></li>
      }
    </ul>

    <ng-template #card let-item>
      <a [routerLink]="['/profesional', item.pro.id]" class="group flex h-full flex-col rounded-2xl bg-canvas p-4 text-ink transition-colors hover:bg-white">
        <span class="flex items-center gap-3">
          <app-avatar [subject]="item.avatar" alt="" class="size-12 shrink-0 rounded-xl text-base" />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5 text-[15.5px] font-semibold">
              <span class="truncate group-hover:underline">{{ item.pro.displayName }}</span><app-pro-badge />
            </span>
            <span class="block truncate text-[13px] text-muted">{{ item.pro.headline || services(item.pro) }}</span>
          </span>
        </span>
        <span class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          @if (item.pro.averageRating !== null) {
            <span><span class="text-accent" aria-hidden="true">★</span> <span class="font-bold">{{ f1(item.pro.averageRating) }}</span><span class="text-muted"> · {{ item.pro.reviewsCount }} {{ item.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span></span>
          } @else {
            <span class="text-muted">Sin reseñas todavía</span>
          }
          <span class="flex items-center gap-1.5 font-semibold" [class]="item.pro.availableToday ? 'text-brand' : 'text-muted'">
            <span class="size-2 rounded-full" [class]="item.pro.availableToday ? 'bg-success' : 'border border-line-dash'" aria-hidden="true"></span>
            {{ item.pro.availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
          </span>
        </span>
        @if (zones(item.pro)) {
          <span class="mt-1.5 flex min-w-0 items-center gap-1 text-[12.5px] text-ink-soft">
            <app-icon name="pin" [size]="13" class="text-subtle" /><span class="truncate">{{ zones(item.pro) }}</span>
          </span>
        }
      </a>
    </ng-template>
  `,
})
export class ProShowcase {
  readonly items = input.required<ShowcaseItem[]>();
  protected readonly visible = VISIBLE;
  protected readonly start = signal(0);
  protected readonly paused = signal(false);
  protected readonly f1 = oneDecimal;

  protected readonly window = computed(() => {
    const list = this.items();
    if (list.length <= VISIBLE) return list;
    return Array.from({ length: VISIBLE }, (_, i) => list[(this.start() + i) % list.length]);
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let timer: ReturnType<typeof setInterval> | undefined;
    effect(() => {
      clearInterval(timer);
      if (reduced || this.paused() || this.items().length <= VISIBLE) return;
      timer = setInterval(() => this.step(1), ROTATE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected step(delta: number): void {
    const n = this.items().length;
    if (n) this.start.update((s) => (s + delta + n) % n);
  }

  protected services(p: ProfessionalSummary): string {
    return p.services.map((s) => s.name).join(', ');
  }

  protected zones(p: ProfessionalSummary): string {
    return coverageText(p);
  }
}
