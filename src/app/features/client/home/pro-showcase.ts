import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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

/**
 * Selección pública de destacados PRO. Una pieza editorial (la lead, con toda
 * la evidencia real) y hasta dos perfiles de apoyo en un listado compacto.
 * El orden lo define la API: sin carrusel, sin rotación, sin flechas.
 */
@Component({
  selector: 'app-pro-showcase',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    .showcase {
      display: grid;
      grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
      gap: 0 48px;
      align-items: start;
    }
    .showcase.solo {
      grid-template-columns: minmax(0, 1fr);
      max-width: 880px;
    }
    .showcase > * {
      animation: fade-up var(--duration-view) var(--ease-enter) both;
    }
    @keyframes fade-up {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    .showcase > :nth-child(2) {
      animation-delay: 70ms;
    }

    /* Lead */
    .lead {
      display: grid;
      grid-template-columns: 208px minmax(0, 1fr);
      gap: 0 32px;
      padding: 28px;
      border-radius: var(--radius-xl);
      background: var(--color-surface);
      color: var(--color-ink);
      transition: background-color var(--duration-component) var(--ease-out-soft);
    }
    .lead-portrait {
      grid-row: span 2;
      width: 208px;
      height: 264px;
      overflow: hidden;
      border-radius: var(--radius-lg);
    }
    .lead-portrait app-avatar {
      display: flex;
      width: 100%;
      height: 100%;
      transition: transform var(--duration-view) var(--ease-out-soft);
    }
    .lead-service {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-brand);
    }
    .lead-name {
      margin-top: 6px;
      font: 600 clamp(30px, 3vw, 42px) / 1.08 var(--font-display);
      letter-spacing: -0.03em;
      overflow-wrap: anywhere;
    }
    .lead-bio {
      margin-top: 14px;
      max-width: 46ch;
      font-size: 16px;
      line-height: 1.6;
      color: var(--color-ink-soft);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .lead-facts {
      grid-column: 2;
      align-self: end;
      display: flex;
      flex-wrap: wrap;
      gap: 14px 32px;
      margin-top: 20px;
      padding-top: 18px;
      border-top: 1px solid var(--color-line-soft);
    }
    .lead-facts dt {
      font-size: 14px;
      color: var(--color-muted);
    }
    .lead-facts dd {
      margin-top: 2px;
      font-size: 22px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--color-ink);
    }
    .lead-foot {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 6px 24px;
      margin-top: 22px;
    }
    .services {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      font-size: 14px;
      color: var(--color-muted);
    }
    .services > span:not(:last-child)::after {
      content: '·';
      margin-left: 16px;
      color: var(--color-line-dash);
    }

    /* Perfiles de apoyo */
    .aside-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-muted);
      padding-bottom: 10px;
      border-bottom: 1px solid var(--color-line);
    }
    .support {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 4px 16px;
      padding: 18px 12px;
      margin-inline: -12px;
      border-bottom: 1px solid var(--color-line-soft);
      border-radius: var(--radius-md);
      color: var(--color-ink);
      transition: background-color var(--duration-micro) var(--ease-out-soft);
    }
    .support app-avatar {
      display: flex;
      grid-row: span 4;
      width: 64px;
      height: 76px;
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: transform var(--duration-component) var(--ease-out-soft);
    }
    .support-name {
      font: 600 20px / 1.2 var(--font-display);
      letter-spacing: -0.015em;
      overflow-wrap: anywhere;
    }
    .support-meta {
      font-size: 14px;
      color: var(--color-ink-soft);
    }

    .support .cta {
      grid-column: 2;
    }
    .cta {
      display: inline-flex;
      white-space: nowrap;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      font-size: 15px;
      font-weight: 600;
      color: var(--color-ink-soft);
      transition: color var(--duration-micro) var(--ease-out-soft);
    }
    .cta app-icon {
      transition: transform var(--duration-micro) var(--ease-out-soft);
    }
    .lead:focus-visible,
    .support:focus-visible {
      outline: 2px solid var(--color-brand);
      outline-offset: 2px;
    }

    @media (hover: hover) {
      .lead:hover {
        background: var(--color-surface-elevated);
      }
      .lead:hover .lead-portrait app-avatar {
        transform: scale(1.03);
      }
      .lead:hover .cta,
      .support:hover .cta {
        color: var(--color-brand);
        text-decoration: underline;
        text-underline-offset: 4px;
      }
      .lead:hover .cta app-icon,
      .support:hover .cta app-icon {
        transform: scale(1.08);
      }
      .support:hover {
        background: var(--color-sand-light);
      }
      .support:hover app-avatar {
        transform: scale(1.04);
      }
    }
    .lead:active,
    .support:active {
      transform: scale(0.995);
    }

    @media (max-width: 1023px) {
      .showcase {
        grid-template-columns: minmax(0, 1fr);
        gap: 28px 0;
      }
    }
    @media (max-width: 639px) {
      .lead {
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 0 16px;
        padding: 20px;
      }
      .lead-portrait {
        width: 88px;
        height: 112px;
        grid-row: 1;
      }
      .lead-name {
        font-size: 28px;
      }
      .lead-main {
        display: contents;
      }
      .lead-head {
        grid-column: 2;
        align-self: center;
      }
      .lead-bio {
        grid-column: 1 / -1;
      }
      .lead-facts {
        grid-column: 1 / -1;
        gap: 12px 24px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .showcase > *,
      .lead:active,
      .support:active {
        animation: none;
        transform: none;
      }
      .lead:hover app-avatar,
      .support:hover app-avatar,
      .lead:hover .cta app-icon,
      .support:hover .cta app-icon {
        transform: none;
      }
    }
  `,
  template: `
    <section class="min-w-0" role="region" aria-label="Profesionales destacados con Resuelve PRO">
      <div
        class="flex flex-col items-start justify-between gap-x-6 gap-y-1 sm:flex-row sm:items-end"
      >
        <div class="min-w-0">
          <p class="text-[14px] font-semibold text-brand">
            Destacado PRO · Espacio promocionado (pago)
          </p>
          <h2
            class="mt-2 font-display text-[28px] leading-tight font-semibold tracking-[-0.03em] text-ink lg:text-[40px]"
          >
            Profesionales destacados
          </h2>
        </div>
        <a routerLink="/profesionales" class="action-link shrink-0 text-brand">
          Ver todos los profesionales <span aria-hidden="true">→</span>
        </a>
      </div>

      @if (loading()) {
        <div class="showcase mt-7" aria-hidden="true">
          <div class="rounded-xl bg-surface p-7">
            <div class="flex gap-6">
              <span class="shimmer h-40 w-32 shrink-0 rounded-lg sm:h-60 sm:w-48"></span>
              <span class="flex flex-1 flex-col gap-3">
                <span class="shimmer h-4 w-1/3 rounded-md"></span>
                <span class="shimmer h-8 w-3/4 rounded-md"></span>
                <span class="shimmer h-3 w-full rounded-md"></span>
                <span class="shimmer h-3 w-2/3 rounded-md"></span>
              </span>
            </div>
          </div>
          <div class="hidden flex-col gap-4 lg:flex">
            <span class="shimmer h-20 rounded-lg"></span>
            <span class="shimmer h-20 rounded-lg"></span>
          </div>
        </div>
        <p class="sr-only" role="status">Cargando profesionales destacados...</p>
      } @else if (lead(); as item) {
        <div class="showcase mt-7" [class.solo]="!rest().length">
          <a
            [routerLink]="['/profesional', item.pro.id]"
            [attr.aria-label]="'Ver perfil de ' + item.pro.displayName"
            class="lead group"
          >
            <span class="lead-portrait">
              <app-avatar [subject]="item.avatar" alt="" class="text-5xl" />
            </span>
            <span class="lead-main block min-w-0">
              <span class="lead-head block min-w-0">
                <span class="lead-service block">{{
                  mainService(item.pro) || 'Servicios por informar'
                }}</span>
                <span class="lead-name block">{{ item.pro.displayName }}</span>
                <span
                  class="mt-3 flex items-center gap-2 text-[14px] font-semibold"
                  [class]="item.pro.availableToday ? 'text-success-strong' : 'text-muted'"
                >
                  <span
                    class="size-2 shrink-0 rounded-full"
                    [class]="item.pro.availableToday ? 'bg-success' : 'border border-line-dash'"
                    aria-hidden="true"
                  ></span>
                  {{ item.pro.availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
                </span>
              </span>
              @if (item.pro.bio) {
                <span class="lead-bio">{{ item.pro.bio }}</span>
              }
            </span>

            <dl class="lead-facts" aria-label="Evidencia del perfil">
              <div>
                <dt>Reseñas</dt>
                <dd>
                  @if (item.pro.averageRating !== null) {
                    <app-icon
                      name="star"
                      [size]="17"
                      [stroke]="2.2"
                      class="mr-1 inline-block align-[-2px] text-accent"
                    />{{ f1(item.pro.averageRating) }}
                    <span class="text-[14px] font-normal text-muted"
                      >· {{ item.pro.reviewsCount }}
                      {{ item.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
                    >
                  } @else {
                    <span class="text-[16px] font-normal text-muted">Sin reseñas todavía</span>
                  }
                </dd>
              </div>
              @if (item.pro.completedJobsCount > 0) {
                <div>
                  <dt>Por Resuelve</dt>
                  <dd>
                    {{ item.pro.completedJobsCount }}
                    <span class="text-[14px] font-normal text-muted">{{
                      item.pro.completedJobsCount === 1 ? 'trabajo' : 'trabajos'
                    }}</span>
                  </dd>
                </div>
              }
              @if (item.pro.yearsExperience > 0) {
                <div>
                  <dt>Experiencia</dt>
                  <dd>
                    {{ item.pro.yearsExperience }}
                    <span class="text-[14px] font-normal text-muted">{{
                      item.pro.yearsExperience === 1 ? 'año' : 'años'
                    }}</span>
                  </dd>
                </div>
              }
              <div>
                <dt>Zona</dt>
                <dd class="text-[16px] font-semibold">
                  {{ zones(item.pro) || 'Cobertura no informada' }}
                </dd>
              </div>
            </dl>

            <span class="lead-foot">
              <span class="services" aria-label="Servicios que ofrece">
                @for (service of item.pro.services.slice(0, 4); track service.id) {
                  <span>{{ service.name }}</span>
                }
              </span>
              <span class="cta"><app-icon name="eye" [size]="18" /> Ver perfil</span>
            </span>
          </a>

          @if (rest().length) {
            <div class="min-w-0">
              <p class="aside-label">También destacados</p>
              <ul>
                @for (other of rest(); track other.pro.id) {
                  <li>
                    <a
                      [routerLink]="['/profesional', other.pro.id]"
                      [attr.aria-label]="'Ver perfil de ' + other.pro.displayName"
                      class="support"
                    >
                      <app-avatar [subject]="other.avatar" alt="" class="text-xl" />
                      <span class="support-name">{{ other.pro.displayName }}</span>
                      <span class="support-meta">
                        {{ mainService(other.pro) || 'Servicios por informar' }}
                        @if (extraServices(other.pro)) {
                          · +{{ extraServices(other.pro) }}
                          {{ extraServices(other.pro) === 1 ? 'servicio' : 'servicios' }}
                        }
                      </span>
                      <span class="support-meta flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        @if (other.pro.averageRating !== null) {
                          <span class="whitespace-nowrap"
                            ><app-icon
                              name="star"
                              [size]="13"
                              [stroke]="2.2"
                              class="mr-0.5 inline-block align-[-2px] text-accent"
                            /><strong class="text-ink">{{ f1(other.pro.averageRating) }}</strong> ·
                            {{ other.pro.reviewsCount }}
                            {{ other.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span
                          >
                        } @else {
                          <span>Sin reseñas todavía</span>
                        }
                        <span [class.text-success-strong]="other.pro.availableToday">{{
                          other.pro.availableToday ? 'Disponible hoy' : 'No disponible hoy'
                        }}</span>
                        <span class="truncate">{{
                          zones(other.pro) || 'Cobertura no informada'
                        }}</span>
                      </span>
                      <span class="cta"><app-icon name="eye" [size]="18" /> Ver perfil</span>
                    </a>
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class ProShowcase {
  readonly items = input.required<ShowcaseItem[]>();
  readonly loading = input(false);
  protected readonly f1 = oneDecimal;
  protected readonly lead = computed(() => this.items()[0] ?? null);
  protected readonly rest = computed(() => this.items().slice(1, 3));

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
