import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AvatarSubject } from '../../../core/models/avatar';
import { ProfessionalSummary } from '../../../core/models/professional';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';

export interface ShowcaseItem {
  pro: ProfessionalSummary;
  avatar: AvatarSubject;
}

/** Stable public selection. The API owns ranking; only mobile scrolls. */
@Component({
  selector: 'app-pro-showcase',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .showcase-grid {
      align-items: start;
    }
    .showcase-card {
      border-top: 2px solid var(--color-brand);
      background: var(--color-surface);
    }
    .showcase-card app-avatar {
      width: 80px;
      height: 96px;
    }
    .showcase-services {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin-top: 14px;
      font-size: 14px;
      color: var(--color-ink-soft);
    }
    .showcase-services > span {
      border-bottom: 1px solid var(--color-line-soft);
      padding-bottom: 3px;
    }
    .showcase-card {
      transition:
        transform var(--duration-component) var(--ease-out-soft),
        border-color var(--duration-micro) var(--ease-out-soft),
        background-color var(--duration-micro) var(--ease-out-soft);
    }
    .showcase-card app-avatar,
    .showcase-card app-icon {
      transition: transform var(--duration-component) var(--ease-out-soft);
    }
    @media (hover: hover) {
      .showcase-card:hover {
        transform: translateY(-1px);
      }
      .showcase-card:hover app-avatar {
        transform: scale(1.015);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .showcase-card:hover,
      .showcase-card:hover app-avatar {
        transform: none;
      }
    }
  `,
  template: `
    <section class="min-w-0" role="region" aria-label="Profesionales destacados con Resuelve PRO">
      <div class="flex items-end justify-between gap-3">
        <div class="min-w-0">
          <h2
            class="font-display text-[28px] leading-tight lg:text-[36px] font-bold tracking-[-0.015em] text-ink"
          >
            Profesionales destacados
          </h2>
          <p class="mt-1 max-w-[42rem] text-[14px] leading-relaxed text-muted">
            Resuelve PRO · Espacio promocionado (pago). No es una recomendación.
          </p>
        </div>
      </div>

      <!-- Desktop: selección estable, sin paginación ni movimiento automático. -->
      @if (loading()) {
        <div class="mt-4 hidden min-h-[13rem] grid-cols-3 gap-3 lg:grid" aria-hidden="true">
          @for (s of [1, 2, 3]; track s) {
            <div class="rounded-2xl bg-sand p-4 ring-1 ring-inset ring-line-soft">
              <div class="flex items-center gap-3">
                <span class="shimmer size-12 rounded-xl"></span
                ><span class="flex flex-1 flex-col gap-2"
                  ><span class="shimmer h-4 w-3/4 rounded-md"></span
                  ><span class="shimmer h-3 w-1/2 rounded-md"></span
                ></span>
              </div>
              <span class="mt-4 block shimmer h-3 w-4/5 rounded-md"></span
              ><span class="mt-2 block shimmer h-3 w-2/3 rounded-md"></span
              ><span class="mt-5 block shimmer h-10 rounded-xl"></span>
            </div>
          }
        </div>
        <div
          class="no-scrollbar relative -mx-5 mt-4 flex min-h-[13rem] snap-x snap-mandatory gap-3 overflow-hidden px-5 pb-1 md:-mx-8 md:px-8 lg:hidden"
          aria-hidden="true"
        >
          <span class="w-[min(82vw,22rem)] flex-none rounded-2xl bg-sand p-4 md:w-[min(44vw,26rem)]"
            ><span class="shimmer block h-12 w-3/4 rounded-xl"></span
            ><span class="shimmer mt-4 block h-3 w-full rounded-md"></span
            ><span class="shimmer mt-2 block h-3 w-2/3 rounded-md"></span
          ></span>
          <span class="w-[min(82vw,22rem)] flex-none rounded-2xl bg-sand p-4 md:w-[min(44vw,26rem)]"
            ><span class="shimmer block h-12 w-3/4 rounded-xl"></span
            ><span class="shimmer mt-4 block h-3 w-full rounded-md"></span
            ><span class="shimmer mt-2 block h-3 w-2/3 rounded-md"></span
          ></span>
        </div>
        <p class="sr-only" role="status">Cargando profesionales destacados...</p>
      } @else {
        <div class="mt-4 hidden w-full lg:flex">
          <ul
            class="showcase-grid grid w-full gap-3"
            aria-live="off"
            aria-label="Selección de profesionales destacados"
            [style.grid-template-columns]="'repeat(' + visibleItems().length + ', minmax(0, 1fr))'"
            [style.max-width.px]="visibleItems().length === 1 ? 560 : null"
          >
            @for (item of visibleItems(); track item.pro.id) {
              <li class="min-w-0 animate-fade-in">
                <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
              </li>
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
            <li class="h-full w-[min(82vw,22rem)] flex-none snap-start md:w-[min(44vw,26rem)]">
              <ng-container *ngTemplateOutlet="card; context: { $implicit: item }" />
            </li>
          }
        </ul>
        @if (items().length > 1) {
          <p class="mt-2 flex items-center gap-1 text-[14px] font-medium text-muted lg:hidden">
            <app-icon name="chevron-right" [size]="13" />Deslizá para ver otro perfil destacado
          </p>
        }
      }

      <ng-template #card let-item>
        <a
          [routerLink]="['/profesional', item.pro.id]"
          [attr.aria-label]="'Ver perfil de ' + item.pro.displayName"
          class="showcase-card group flex min-w-0 flex-col rounded-b-xl bg-surface p-5 text-ink transition-[border-color,background-color] hover:border-brand-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:p-6"
        >
          <span class="flex min-w-0 items-center gap-3">
            <app-avatar
              [subject]="item.avatar"
              alt=""
              class="size-20 shrink-0 rounded-xl text-2xl lg:h-28 lg:w-24"
            />
            <span class="min-w-0 flex-1">
              <span
                class="flex min-w-0 items-center gap-1.5 font-display text-[24px] leading-tight font-semibold"
              >
                <span class="min-w-0 break-words group-hover:underline">{{
                  item.pro.displayName
                }}</span>
              </span>
              <span class="mt-0.5 block text-[16px] text-muted"
                >{{ mainService(item.pro) || 'Servicios por informar' }}
                @if (extraServices(item.pro)) {
                  <span class="whitespace-nowrap"
                    >· +{{ extraServices(item.pro) }}
                    {{ extraServices(item.pro) === 1 ? 'servicio' : 'servicios' }}</span
                  >
                }
              </span>
            </span>
          </span>

          <span class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
            @if (item.pro.averageRating !== null) {
              <span class="inline-flex items-center gap-1 whitespace-nowrap"
                ><app-icon name="star" [size]="13" [stroke]="2.2" class="text-accent" /><span
                  class="font-bold"
                  >{{ f1(item.pro.averageRating) }}</span
                ><span class="text-muted">
                  · {{ item.pro.reviewsCount }}
                  {{ item.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
                ></span
              >
            } @else {
              <span class="text-muted">Sin reseñas todavía</span>
            }
            <span
              class="flex items-center gap-1.5 font-semibold"
              [class]="item.pro.availableToday ? 'text-brand' : 'text-muted'"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                [class]="item.pro.availableToday ? 'bg-success' : 'border border-line-dash'"
                aria-hidden="true"
              ></span>
              {{ item.pro.availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
            </span>
          </span>

          <span class="mt-1.5 flex min-w-0 items-center gap-1 text-[14px] text-ink-soft">
            <app-icon name="pin" [size]="13" class="shrink-0 text-subtle" /><span
              class="truncate"
              >{{ zones(item.pro) || 'Cobertura no informada' }}</span
            >
          </span>

          @if (item.pro.completedJobsCount > 0 || item.pro.yearsExperience > 0) {
            <span
              class="mt-3 flex flex-wrap gap-2 border-t border-line/70 pt-3 text-[14px] font-medium text-ink-soft"
            >
              @if (item.pro.completedJobsCount > 0) {
                <span
                  >{{ item.pro.completedJobsCount }}
                  {{ item.pro.completedJobsCount === 1 ? 'trabajo' : 'trabajos' }} por
                  Resuelve</span
                >
              }
              @if (item.pro.yearsExperience > 0) {
                <span
                  >{{ item.pro.yearsExperience }}
                  {{ item.pro.yearsExperience === 1 ? 'año' : 'años' }} de experiencia</span
                >
              }
            </span>
          }

          @if (item.pro.bio) {
            <span class="mt-3 line-clamp-2 text-[16px] leading-6 text-ink-soft">{{
              item.pro.bio
            }}</span>
          }
          @if (item.pro.services.length > 1) {
            <span class="showcase-services" aria-label="Servicios que ofrece">
              @for (service of item.pro.services.slice(0, 3); track service.id) {
                <span>{{ service.name }}</span>
              }
            </span>
          }
          <span class="profile-link mt-3 group-hover:text-brand">
            <app-icon name="eye" [size]="18" /> Ver perfil
          </span>
        </a>
      </ng-template>
    </section>
  `,
})
export class ProShowcase {
  readonly items = input.required<ShowcaseItem[]>();
  readonly loading = input(false);
  protected readonly f1 = oneDecimal;
  protected readonly visibleItems = computed(() => this.items().slice(0, 3));

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
