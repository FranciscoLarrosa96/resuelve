import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarSubject } from '../../../core/models/avatar';
import { ProfessionalSummary } from '../../../core/models/professional';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../shared/components/plan-badges/plan-badges';

export interface ShowcaseItem {
  pro: ProfessionalSummary;
  avatar: AvatarSubject;
}

/** Three compact cards need about 900px of real inner width to stay readable. */
const THREE_CARD_MIN_WIDTH = 900;

export function visibleCardsForWidth(width: number): 2 | 3 {
  return width >= THREE_CARD_MIN_WIDTH ? 3 : 2;
}

/**
 * Vitrina pública de perfiles PRO en Home. El backend sigue definiendo los
 * perfiles y su orden; este componente solo presenta los datos disponibles.
 * Mobile conserva el carrusel táctil. Desktop muestra 2 o 3 tarjetas según el
 * ancho real, y navega por páginas completas solo con las flechas.
 */
@Component({
  selector: 'app-pro-showcase',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Icon, ProBadge, FeaturedLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .showcase-card { transition: transform var(--duration-component) var(--ease-out-soft), border-color var(--duration-micro) var(--ease-out-soft), background-color var(--duration-micro) var(--ease-out-soft); }
    .showcase-card app-avatar, .showcase-card app-icon { transition: transform var(--duration-component) var(--ease-out-soft); }
    @media (hover: hover) { .showcase-card:hover { transform: translateY(-2px); } .showcase-card:hover app-avatar { transform: scale(1.025); } .showcase-card:hover .profile-arrow { transform: translateX(3px); } }
    @media (prefers-reduced-motion: reduce) { .showcase-card:hover, .showcase-card:hover app-avatar, .showcase-card:hover .profile-arrow { transform: none; } }
  `,
  template: `
    <section
      class="min-w-0"
      role="region"
      aria-label="Profesionales destacados con Resuelve PRO"
      aria-roledescription="carrusel"
    >
      <div class="flex items-end justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-display text-[22px] leading-tight font-bold tracking-[-0.015em] text-white">Profesionales destacados</h3>
          <p class="mt-1 max-w-[42rem] text-[12.5px] leading-relaxed text-on-brand-muted">Perfiles con Resuelve PRO. Espacio promocionado: no es una verificación ni una recomendación.</p>
        </div>
        @if (!loading() && items().length > visible()) {
          <div class="hidden shrink-0 gap-1.5 lg:flex">
            <button
              type="button"
              class="grid size-10 place-items-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Anterior profesional destacado"
              [disabled]="currentPage() === 0"
              (click)="previous()"
            ><app-icon name="chevron-left" [size]="17" [stroke]="2.4" /></button>
            <button
              type="button"
              class="grid size-10 place-items-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Siguiente profesional destacado"
              [disabled]="currentPage() >= pageCount() - 1"
              (click)="next()"
            ><app-icon name="chevron-right" [size]="17" [stroke]="2.4" /></button>
          </div>
        }
      </div>

      <!-- Desktop: 2 o 3 perfiles por página, con el orden entregado por la API. -->
      @if (loading()) {
        <div class="mt-4 hidden min-h-[13rem] grid-cols-2 gap-3 lg:grid" aria-hidden="true">
          @for (s of [1, 2]; track s) {
            <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-inset ring-white/10">
              <div class="flex items-center gap-3"><span class="shimmer size-12 rounded-xl"></span><span class="flex flex-1 flex-col gap-2"><span class="shimmer h-4 w-3/4 rounded-md"></span><span class="shimmer h-3 w-1/2 rounded-md"></span></span></div>
              <span class="mt-4 block shimmer h-3 w-4/5 rounded-md"></span><span class="mt-2 block shimmer h-3 w-2/3 rounded-md"></span><span class="mt-5 block shimmer h-10 rounded-xl"></span>
            </div>
          }
        </div>
        <div class="no-scrollbar relative -mx-5 mt-4 flex min-h-[13rem] snap-x snap-mandatory gap-3 overflow-hidden px-5 pb-1 md:-mx-8 md:px-8 lg:hidden" aria-hidden="true">
          <span class="w-[min(82vw,22rem)] flex-none rounded-2xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 md:w-[min(44vw,26rem)]"><span class="shimmer block h-12 w-3/4 rounded-xl"></span><span class="shimmer mt-4 block h-3 w-full rounded-md"></span><span class="shimmer mt-2 block h-3 w-2/3 rounded-md"></span></span>
          <span class="w-[min(82vw,22rem)] flex-none rounded-2xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 md:w-[min(44vw,26rem)]"><span class="shimmer block h-12 w-3/4 rounded-xl"></span><span class="shimmer mt-4 block h-3 w-full rounded-md"></span><span class="shimmer mt-2 block h-3 w-2/3 rounded-md"></span></span>
        </div>
        <p class="sr-only" role="status">Cargando profesionales destacados...</p>
      } @else {
      <div class="mt-4 hidden w-full justify-center lg:flex">
        <ul
          class="grid w-full gap-3"
          aria-live="off"
          aria-roledescription="página del carrusel"
          [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'"
          [style.max-width.px]="visibleItems().length === 1 ? 560 : null"
        >
          @for (item of visibleItems(); track item.pro.id) {
            <li class="h-full min-w-0 animate-fade-in"><ng-container *ngTemplateOutlet="card; context: { $implicit: item }" /></li>
          }
        </ul>
      </div>

      <!-- Mobile/tablet: ancho fluido con preview de la tarjeta siguiente y snap táctil. -->
      <ul
        class="no-scrollbar relative -mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:-mx-8 md:scroll-px-8 md:px-8 lg:hidden"
        tabindex="0"
        aria-label="Perfiles destacados; desplazamiento horizontal"
        aria-roledescription="carrusel"
      >
        @for (item of items(); track item.pro.id) {
          <li class="h-full w-[min(82vw,22rem)] flex-none snap-start md:w-[min(44vw,26rem)]"><ng-container *ngTemplateOutlet="card; context: { $implicit: item }" /></li>
        }
      </ul>
      @if (items().length > 1) {
        <p class="mt-2 flex items-center gap-1 text-[12px] font-medium text-on-brand-muted lg:hidden"><app-icon name="chevron-right" [size]="13" />Deslizá para ver otro perfil destacado</p>
      }
      }

      <ng-template #card let-item>
        <a
          [routerLink]="['/profesional', item.pro.id]"
          [attr.aria-label]="'Ver perfil de ' + item.pro.displayName"
          class="showcase-card group flex h-full min-w-0 flex-col rounded-2xl border border-line bg-surface p-4 text-ink transition-[border-color,background-color] hover:border-brand-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:p-4.5"
        >
          <app-featured-label class="mb-2.5" />
          <span class="flex min-w-0 items-center gap-3">
            <app-avatar [subject]="item.avatar" alt="" class="size-12 shrink-0 rounded-xl text-base lg:size-13" />
            <span class="min-w-0 flex-1">
              <span class="flex min-w-0 items-center gap-1.5 text-[15.5px] font-semibold">
                <span class="min-w-0 break-words group-hover:underline">{{ item.pro.displayName }}</span><app-pro-badge />
              </span>
              <span class="mt-0.5 block line-clamp-1 text-[13px] text-muted">{{ mainService(item.pro) || 'Servicios por informar' }}@if (extraServices(item.pro)) { <span class="whitespace-nowrap">· +{{ extraServices(item.pro) }} {{ extraServices(item.pro) === 1 ? 'servicio' : 'servicios' }}</span> }</span>
            </span>
          </span>

          <span class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] lg:text-[13px]">
            @if (item.pro.averageRating !== null) {
              <span class="inline-flex items-center gap-1 whitespace-nowrap"><app-icon name="star" [size]="13" [stroke]="2.2" class="text-accent" /><span class="font-bold">{{ f1(item.pro.averageRating) }}</span><span class="text-muted"> · {{ item.pro.reviewsCount }} {{ item.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span></span>
            } @else {
              <span class="text-muted">Sin reseñas todavía</span>
            }
            <span class="flex items-center gap-1.5 font-semibold" [class]="item.pro.availableToday ? 'text-brand' : 'text-muted'">
              <span class="size-2 shrink-0 rounded-full" [class]="item.pro.availableToday ? 'bg-success' : 'border border-line-dash'" aria-hidden="true"></span>
              {{ item.pro.availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
            </span>
          </span>

          <span class="mt-1.5 flex min-w-0 items-center gap-1 text-[12.5px] text-ink-soft">
            <app-icon name="pin" [size]="13" class="shrink-0 text-subtle" /><span class="truncate">{{ zones(item.pro) || 'Cobertura no informada' }}</span>
          </span>

          @if (item.pro.completedJobsCount > 0 || item.pro.yearsExperience > 0) {
            <span class="mt-3 hidden flex-wrap gap-2 border-t border-line/70 pt-3 text-[12px] font-medium text-ink-soft lg:flex">
              @if (item.pro.completedJobsCount > 0) {
                <span>{{ item.pro.completedJobsCount }} {{ item.pro.completedJobsCount === 1 ? 'trabajo' : 'trabajos' }} por Resuelve</span>
              }
              @if (item.pro.yearsExperience > 0) {
                <span>{{ item.pro.yearsExperience }} {{ item.pro.yearsExperience === 1 ? 'año' : 'años' }} de experiencia</span>
              }
            </span>
          }

          <span class="mt-auto hidden h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors group-hover:bg-primary-hover lg:flex">
            Ver perfil <app-icon name="arrow-right" class="profile-arrow" [size]="16" [stroke]="2.4" />
          </span>
        </a>
      </ng-template>
    </section>
  `,
})
export class ProShowcase {
  readonly items = input.required<ShowcaseItem[]>();
  readonly loading = input(false);
  protected readonly visible = signal(2);
  protected readonly page = signal(0);
  protected readonly f1 = oneDecimal;
  protected readonly pageCount = computed(() => Math.ceil(this.items().length / this.visible()));
  protected readonly currentPage = computed(() => Math.max(0, Math.min(this.page(), this.pageCount() - 1)));
  protected readonly visibleItems = computed(() => {
    const start = this.currentPage() * this.visible();
    return this.items().slice(start, start + this.visible());
  });
  protected readonly columns = computed(() => Math.max(1, Math.min(this.visible(), this.visibleItems().length)));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const host = inject(ElementRef<HTMLElement>).nativeElement;
    const destroyRef = inject(DestroyRef);
    const updateVisible = () => {
      this.visible.set(visibleCardsForWidth(host.getBoundingClientRect().width));
    };

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateVisible);
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    } else {
      window.addEventListener('resize', updateVisible);
      destroyRef.onDestroy(() => window.removeEventListener('resize', updateVisible));
    }
    updateVisible();
  }

  protected previous(): void {
    this.page.set(Math.max(0, this.currentPage() - 1));
  }

  protected next(): void {
    this.page.set(Math.min(this.pageCount() - 1, this.currentPage() + 1));
  }

  protected mainService(p: ProfessionalSummary): string {
    return p.headline?.trim() || p.services[0]?.name || '';
  }

  protected extraServices(p: ProfessionalSummary): number {
    return Math.max(0, p.services.length - 1);
  }

  protected zones(p: ProfessionalSummary): string {
    if (p.coversEntireCity) return 'Todo Tandil';
    const names = (p.zones ?? []).slice(0, 2).map((zone) => zone.name);
    const remaining = (p.zones?.length ?? 0) - names.length;
    return names.length ? `${names.join(', ')}${remaining ? ` +${remaining}` : ''}` : '';
  }
}
