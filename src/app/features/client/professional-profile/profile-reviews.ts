import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfessionalDetail } from '../../../core/models/professional';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { oneDecimal } from '../../../core/utils/format';
import {
  hasReviews,
  reputationLabel,
  reviewMonth,
  reviewsLabel,
} from '../../../core/utils/reputation';
import { Stars } from '../../../shared/components/stars/stars';

/**
 * "Opiniones" del perfil público: promedio real, distribución y reseñas
 * (más recientes primero, sin ocultar críticas). Cada reseña muestra solo el
 * nombre de pila y el mes: nada de barrio, monto ni fecha exacta del trabajo.
 */
@Component({
  selector: 'app-profile-reviews',
  imports: [Stars, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [attr.aria-labelledby]="headingId()">
      <h2
        [id]="headingId()"
        class="font-sans font-bold tracking-[-0.02em]"
        [class]="compact() ? 'text-[19px]' : 'text-[22px]'"
      >
        Opiniones
      </h2>
      @if (!hasAny()) {
        <div class="mt-3 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5 sm:py-4.5">
          <div class="text-[15px] font-semibold">Todavía no tiene reseñas.</div>
          <p class="mt-0.5 text-sm text-muted">
            Cuando complete trabajos en Resuelve, sus clientes podrán compartir su experiencia.
          </p>
        </div>
      } @else {
        <div
          class="mt-3.5 grid items-start gap-x-7 gap-y-3"
          [class]="compact() ? '' : 'md:grid-cols-[220px_minmax(0,1fr)]'"
        >
          <div
            class="flex items-center gap-4.5"
            [class]="
              compact()
                ? ''
                : 'md:flex-col md:items-stretch md:gap-0 md:rounded-2xl md:border md:border-line md:bg-surface md:p-4.5'
            "
          >
            <div [attr.aria-label]="summaryLabel()" role="img">
              <div class="text-[40px] leading-none font-bold tabular-nums" aria-hidden="true">
                {{ average() }} <span class="text-[22px] text-accent">★</span>
              </div>
              <div class="mt-1 text-[14px] text-muted" aria-hidden="true">{{ countLabel() }}</div>
            </div>
            <ul
              class="flex flex-1 flex-col gap-1.25"
              [class]="compact() ? '' : 'md:mt-3.5'"
              aria-label="Distribución de puntajes"
            >
              @for (row of distribution(); track row.stars) {
                <li
                  class="grid grid-cols-[12px_1fr_24px] items-center gap-2 text-[14px] font-medium text-muted"
                >
                  <span class="sr-only"
                    >{{ row.stars }} {{ row.stars === 1 ? 'estrella' : 'estrellas' }}:
                    {{ row.count }}</span
                  >
                  <span aria-hidden="true">{{ row.stars }}</span>
                  <span class="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true"
                    ><span
                      class="block h-full rounded-full bg-accent"
                      [style.width.%]="row.pct"
                    ></span
                  ></span>
                  <span class="text-right tabular-nums" aria-hidden="true">{{ row.count }}</span>
                </li>
              }
            </ul>
          </div>

          <div class="min-w-0">
            <ul class="flex flex-col border-t border-line">
              @for (r of pro().reviews; track r.id; let i = $index) {
                <li
                  class="animate-fade-in border-b border-line py-4"
                  [style.animation-delay.ms]="(i < 8 ? i : 8) * 30"
                >
                  <app-stars [rating]="r.rating" [size]="14" />
                  @if (r.comment) {
                    <p
                      class="mt-2 text-[15px] leading-normal text-pretty break-words text-ink-soft"
                    >
                      “{{ r.comment }}”
                    </p>
                  }
                  <p class="mt-2 text-[14px] text-muted">
                    {{ r.reviewerDisplayName }} · {{ month(r.createdAt) }}
                  </p>
                </li>
              }
            </ul>
            <p class="mt-3 text-[14px] text-muted">
              Estas reseñas son de clientes que contrataron a {{ pro().firstName }} por Resuelve, una
              por trabajo realizado.
            </p>
            @if (store.hasMoreReviews()) {
              <button
                type="button"
                class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14px] font-semibold text-ink disabled:opacity-60 press"
                [disabled]="store.reviewsLoading()"
                (click)="store.loadMoreReviews()"
              >
                {{ store.reviewsLoading() ? 'Cargando…' : 'Ver más reseñas' }}
              </button>
            }
            @if (store.reviewsError()) {
              <p class="mt-2 text-[14px] font-medium text-danger" role="alert">
                No pudimos cargar más reseñas. Probá de nuevo.
              </p>
            }
          </div>
        </div>
      }

      <!-- Clientes que el profesional invitó (QR / enlace): aparte, rotuladas y fuera del puntaje. -->
      @if (invitedCount() > 0) {
        <div class="mt-8" data-testid="invited-reviews">
          <h3 class="font-sans text-[17px] font-bold tracking-[-0.01em]">Clientes invitados</h3>
          <p class="mt-1 text-[14px] text-muted">
            {{ invitedSummary() }} · {{ pro().firstName }} los invitó a opinar; no contrataron por
            Resuelve y no cuentan en su puntaje.
          </p>
          <ul class="mt-2 flex flex-col border-t border-line">
            @for (r of pro().invitedReviews ?? []; track r.id) {
              <li class="border-b border-line py-4">
                <app-stars [rating]="r.rating" [size]="14" />
                @if (r.comment) {
                  <p class="mt-2 text-[15px] leading-normal text-pretty break-words text-ink-soft">
                    “{{ r.comment }}”
                  </p>
                }
                <p class="mt-2 text-[14px] text-muted">
                  {{ r.reviewerDisplayName }} · {{ month(r.createdAt) }}
                </p>
              </li>
            }
          </ul>
          @if (store.hasMoreInvitedReviews()) {
            <button
              type="button"
              class="mt-3 h-11 rounded-xl button-secondary px-4 text-[14px] font-semibold text-ink disabled:opacity-60 press"
              [disabled]="store.reviewsLoading()"
              (click)="store.loadMoreInvitedReviews()"
            >
              {{ store.reviewsLoading() ? 'Cargando…' : 'Ver más' }}
            </button>
          }
        </div>
      }

      <!-- Cualquiera con cuenta puede opinar; sin sesión pasa primero por el registro. -->
      <div class="mt-6 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5 sm:py-4.5">
        <div class="text-[15px] font-semibold">¿Trabajaste con {{ pro().firstName }}?</div>
        <p class="mt-0.5 text-sm text-muted">Contale a otros vecinos cómo te fue. Lleva un minuto.</p>
        <a
          [routerLink]="reviewLink()"
          class="button-secondary mt-3 inline-flex min-h-11 items-center rounded-xl px-4 text-[15px] font-semibold text-ink"
          data-testid="leave-review"
          >Dejar mi reseña</a
        >
      </div>
    </section>
  `,
})
export class ProfileReviews {
  protected readonly store = inject(ProfessionalsStore);
  readonly pro = input.required<ProfessionalDetail>();
  readonly headingId = input('reviews-title');
  /** Mobile: columna única, títulos más chicos. */
  readonly compact = input(false);

  protected readonly invitedCount = computed(() => this.pro().invitedReviewsCount ?? 0);
  protected readonly invitedSummary = computed(() => {
    const avg = this.pro().invitedAverageRating;
    return avg ? `${oneDecimal(avg)} ★ · ${reviewsLabel(this.invitedCount())}` : reviewsLabel(this.invitedCount());
  });
  protected readonly reviewLink = computed(() => {
    const p = this.pro();
    return p.slug ? ['/p', p.slug, 'resenar'] : ['/profesional', p.id, 'resenar'];
  });
  protected readonly hasAny = computed(() => hasReviews(this.pro()));
  protected readonly average = computed(() => oneDecimal(this.pro().averageRating ?? 0));
  protected readonly countLabel = computed(() => reviewsLabel(this.pro().reviewsCount));
  protected readonly summaryLabel = computed(() => reputationLabel(this.pro()));
  protected readonly distribution = computed(() => {
    const buckets = this.pro().ratingDistribution ?? [];
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    return buckets.map((b) => ({ ...b, pct: total ? Math.round((b.count / total) * 100) : 0 }));
  });
  protected readonly month = reviewMonth;
}
