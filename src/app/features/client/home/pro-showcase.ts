import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarSubject } from '../../../core/models/avatar';
import { ProfessionalSummary } from '../../../core/models/professional';
import { oneDecimal } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { Icon } from '../../../shared/components/icon/icon';
import { noReviewsText } from '../../../core/utils/reputation';

export interface ShowcaseItem {
  pro: ProfessionalSummary;
  avatar: AvatarSubject;
}

/**
 * Selección pública de destacados PRO: hasta tres fichas con el mismo peso
 * (foto, rubro, nombre y solo evidencia real). Solo se muestra lo positivo:
 * "Toma urgencias" aparece cuando es cierto, nunca "No toma urgencias".
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
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .showcase.n1 {
      grid-template-columns: minmax(0, 420px);
    }
    .showcase.n2 {
      grid-template-columns: repeat(2, minmax(0, 420px));
    }
    .card {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      grid-template-rows: auto 1fr auto;
      gap: 16px;
      padding: 22px;
      border-radius: var(--radius-xl);
      background: var(--color-surface);
      color: var(--color-ink);
      animation: fade-up var(--duration-view) var(--ease-enter) both;
      transition:
        transform var(--duration-component) var(--ease-out-soft),
        box-shadow var(--duration-component) var(--ease-out-soft);
    }
    .card:nth-child(2) {
      animation-delay: 50ms;
    }
    .card:nth-child(3) {
      animation-delay: 100ms;
    }
    @keyframes fade-up {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
    .card app-avatar {
      display: flex;
      width: 72px;
      height: 88px;
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .name {
      display: block;
      margin-top: 4px;
      font: 600 22px / 1.15 var(--font-display);
      letter-spacing: -0.015em;
      overflow-wrap: anywhere;
    }
    .facts {
      grid-column: 1 / -1;
      align-self: start;
      display: grid;
      gap: 6px;
      padding-top: 14px;
      border-top: 1px solid var(--color-line-soft);
      font-size: 14px;
    }
    .facts > div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .facts dt {
      color: var(--color-muted);
    }
    .facts dd {
      text-align: right;
      color: var(--color-ink-soft);
    }
    .cta {
      grid-column: 1 / -1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      font-size: 15px;
      font-weight: 600;
      color: var(--color-brand);
    }
    .card:has(a:focus-visible) {
      outline: 2px solid var(--color-brand);
      outline-offset: 2px;
    }
    .card a:focus-visible {
      outline: none;
    }
    @media (hover: hover) {
      .card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-float);
      }
      .card:hover .cta {
        text-decoration: underline;
        text-underline-offset: 4px;
      }
    }
    .card:active {
      transform: scale(0.985);
    }
    @media (max-width: 1023px) {
      .showcase,
      .showcase.n2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 639px) {
      .showcase,
      .showcase.n1,
      .showcase.n2 {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .card,
      .card:hover,
      .card:active {
        animation: none;
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
            Destacado PRO <span class="font-medium text-muted">· Espacio promocionado (pago)</span>
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
          <span class="shimmer h-56 rounded-xl"></span>
          <span class="shimmer h-56 rounded-xl"></span>
          <span class="shimmer hidden h-56 rounded-xl lg:block"></span>
        </div>
        <p class="sr-only" role="status">Cargando profesionales destacados...</p>
      } @else if (visible().length) {
        <ul
          class="showcase mt-7"
          [class.n1]="visible().length === 1"
          [class.n2]="visible().length === 2"
        >
          @for (item of visible(); track item.pro.id) {
            <li class="card relative">
              <app-avatar [subject]="item.avatar" alt="" class="text-xl" />
              <span class="flex min-w-0 flex-col items-start gap-1">
                <span class="text-[14px] font-semibold text-brand">
                  {{ mainService(item.pro) || 'Servicios por informar' }}
                  @if (extraServices(item.pro)) {
                    · +{{ extraServices(item.pro) }}
                    {{ extraServices(item.pro) === 1 ? 'servicio' : 'servicios' }}
                  }
                </span>
                <a
                  [routerLink]="['/profesional', item.pro.id]"
                  [attr.aria-label]="'Ver perfil de ' + item.pro.displayName"
                  class="name after:absolute after:inset-0 after:rounded-xl after:content-['']"
                  >{{ item.pro.displayName }}</a
                >
                @if (item.pro.availableToday) {
                  <span
                    class="mt-1 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-[13px] font-semibold text-success-strong"
                  >
                    <span class="size-1.5 rounded-full bg-success" aria-hidden="true"></span>
                    Toma urgencias
                  </span>
                }
              </span>

              <dl class="facts">
                <div>
                  <dt>Reseñas</dt>
                  <dd>
                    @if (item.pro.averageRating !== null) {
                      <app-icon
                        name="star"
                        [size]="14"
                        [stroke]="2.2"
                        class="mr-0.5 inline-block align-[-2px] text-accent"
                      /><strong class="text-ink">{{ f1(item.pro.averageRating) }}</strong> ·
                      {{ item.pro.reviewsCount }}
                      {{ item.pro.reviewsCount === 1 ? 'reseña' : 'reseñas' }}
                    } @else {
                      {{ noReviews(item.pro) }}
                    }
                  </dd>
                </div>
                @if (item.pro.yearsExperience > 0) {
                  <div>
                    <dt>Experiencia</dt>
                    <dd>
                      {{ item.pro.yearsExperience }}
                      {{ item.pro.yearsExperience === 1 ? 'año' : 'años' }}
                    </dd>
                  </div>
                }
                @if (item.pro.completedJobsCount > 0) {
                  <div>
                    <dt>Por Resuelve</dt>
                    <dd>
                      {{ item.pro.completedJobsCount }}
                      {{ item.pro.completedJobsCount === 1 ? 'trabajo' : 'trabajos' }}
                    </dd>
                  </div>
                }
                <div>
                  <dt>Zona</dt>
                  <dd>{{ zones(item.pro) || 'Cobertura no informada' }}</dd>
                </div>
              </dl>

              <span class="cta" aria-hidden="true"
                >Ver perfil <app-icon name="arrow-right" [size]="16"
              /></span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ProShowcase {
  readonly items = input.required<ShowcaseItem[]>();
  readonly loading = input(false);
  protected readonly f1 = oneDecimal;
  protected readonly noReviews = noReviewsText;
  protected readonly visible = computed(() => this.items().slice(0, 3));

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
