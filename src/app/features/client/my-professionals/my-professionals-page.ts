import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../core/models/professional';
import { HiredProfessional, SavedProfessional, unavailableText } from '../../../core/models/retention';
import { AuthStore } from '../../../core/state/auth.store';
import { MyProfessionalsStore } from '../../../core/state/my-professionals.store';
import { RequestStore } from '../../../core/state/request.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { formatPastDate } from '../../../core/utils/notification-time';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { SaveProfessional } from '../../../shared/components/save-professional/save-professional';

/**
 * "Mis profesionales": dos grupos que no se mezclan.
 * - Contratados anteriormente: salen de trabajos REALES realizados (el más reciente primero).
 * - Guardados: los que el cliente guardó a mano (el último guardado primero).
 * Un profesional pausado o sin servicio público sigue visible con su historial, sin acción de contratar.
 */
@Component({
  selector: 'app-my-professionals-page',
  imports: [RouterLink, Avatar, SaveProfessional],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl animate-fade-in px-4 pt-5.5 pb-12 lg:px-8 lg:pt-10">
      <h1 class="px-1 font-display text-[28px] font-bold tracking-[-0.02em] lg:px-0 lg:text-[40px] lg:tracking-[-0.025em]">
        Mis profesionales
      </h1>
      <p class="mt-1.5 hidden px-1 text-base text-muted lg:block lg:px-0">
        Con quienes ya trabajaste y los perfiles que guardaste para después.
      </p>

      @if (store.error() && !store.data()) {
        <div class="mt-8 rounded-2xl border border-line bg-surface p-6 text-center" role="alert">
          <p class="text-[15px] text-ink-soft">No pudimos cargar tus profesionales.</p>
          <button type="button" class="button-primary mt-4 min-h-11 rounded-xl px-5 text-[15px] font-semibold" (click)="store.load(true)">
            Reintentar
          </button>
        </div>
      } @else if (!store.data()) {
        <div class="mt-8 space-y-3" role="status">
          <span class="sr-only">Cargando tus profesionales…</span>
          @for (i of [1, 2]; track i) {
            <div class="shimmer h-36 rounded-2xl" aria-hidden="true"></div>
          }
        </div>
      } @else {
        <section class="mt-8" aria-labelledby="hired-title">
          <h2 id="hired-title" class="px-1 text-[17px] font-semibold lg:px-0">Contratados anteriormente</h2>
          @if (!store.hired().length) {
            <div class="mt-3 rounded-2xl border border-line bg-surface p-5" data-testid="hired-empty">
              <p class="text-[15px] font-medium text-ink">Todavía no contrataste profesionales por Resuelve.</p>
              <p class="mt-1 text-[15px] text-muted">
                Cuando completes un trabajo, vas a poder encontrarlo acá para volver a contactarlo.
              </p>
              <a routerLink="/profesionales" class="button-primary mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-[15px] font-semibold">
                Buscar profesionales
              </a>
            </div>
          } @else {
            <ul class="mt-3 grid list-none gap-3 p-0">
              @for (h of store.hired(); track h.professional.id; let i = $index) {
                <li class="stagger-in lift rounded-2xl border border-line bg-surface p-4" [style.--i]="i" data-testid="hired-card">
                  <div class="flex items-start gap-3.5">
                    <a [routerLink]="['/profesional', h.professional.id]" tabindex="-1" aria-hidden="true">
                      <app-avatar [subject]="avatar(h.professional)" alt="" class="size-14 rounded-xl text-lg" />
                    </a>
                    <div class="min-w-0 flex-1">
                      <h3 class="truncate text-[17px] font-bold leading-6">
                        <a [routerLink]="['/profesional', h.professional.id]" class="hover:underline">{{ h.professional.displayName }}</a>
                      </h3>
                      <p class="truncate text-[14.5px] text-ink-soft">{{ service(h.professional) }}</p>
                      <p class="mt-1.5 text-[14px] text-muted">
                        Último trabajo · {{ date(h.lastCompletedAt) }}
                      </p>
                      <p class="text-[14px] text-muted">
                        {{ jobsLabel(h.jobsCount) }}
                        @if (h.professional.averageRating !== null) {
                          <span aria-hidden="true"> · </span
                          ><span class="text-accent" aria-hidden="true">★</span>
                          <span class="sr-only">Calificación </span><strong class="text-ink">{{ f1(h.professional.averageRating) }}</strong>
                        }
                      </p>
                      @if (note(h.availability); as text) {
                        <p class="mt-2 text-[14px] font-medium text-ink-soft" role="status">{{ text }}</p>
                      }
                    </div>
                    <app-save-professional [professionalId]="h.professional.id" [name]="h.professional.displayName" />
                  </div>
                  <div class="mt-3.5 flex flex-wrap items-center gap-2">
                    @if (h.canRequest) {
                      <button
                        type="button"
                        class="button-primary min-h-11 rounded-xl px-4 text-[15px] font-semibold"
                        [attr.aria-label]="'Volver a contratar a ' + h.professional.displayName"
                        (click)="rehire(h)"
                      >
                        Volver a contratar
                      </button>
                    }
                    <a
                      [routerLink]="['/profesional', h.professional.id]"
                      class="button-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-[15px] font-semibold text-ink"
                      >Ver perfil</a
                    >
                  </div>
                  @if (h.jobs.length) {
                    <details class="mt-3 border-t border-line-soft pt-3">
                      <summary class="min-h-10 cursor-pointer list-none text-[14.5px] font-semibold text-brand marker:hidden">
                        Trabajos anteriores ({{ h.jobsCount }})
                      </summary>
                      <ul class="mt-2 list-none divide-y divide-line-soft p-0">
                        @for (job of h.jobs; track job.requestId) {
                          <li>
                            <a
                              [routerLink]="['/mis-solicitudes', job.requestId]"
                              class="flex items-center justify-between gap-3 py-2.5 hover:underline"
                            >
                              <span class="min-w-0">
                                <span class="block text-[13px] text-muted">{{ date(job.completedAt) }}</span>
                                <span class="block truncate text-[15px] font-medium text-ink">{{ job.title }}</span>
                              </span>
                              <span class="shrink-0 text-[13.5px] font-semibold text-success-strong">Realizado</span>
                            </a>
                          </li>
                        }
                      </ul>
                    </details>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <section class="mt-10" aria-labelledby="saved-title">
          <h2 id="saved-title" class="px-1 text-[17px] font-semibold lg:px-0">Guardados</h2>
          @if (!store.saved().length) {
            <div class="mt-3 rounded-2xl border border-line bg-surface p-5" data-testid="saved-empty">
              <p class="text-[15px] font-medium text-ink">Todavía no guardaste profesionales.</p>
              <p class="mt-1 text-[15px] text-muted">
                Guardá perfiles que te interesen para encontrarlos más rápido después.
              </p>
              <a routerLink="/profesionales" class="button-secondary mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-ink">
                Buscar profesionales
              </a>
            </div>
          } @else {
            <ul class="mt-3 grid list-none gap-3 p-0">
              @for (s of store.saved(); track s.professional.id; let i = $index) {
                <li class="stagger-in lift rounded-2xl border border-line bg-surface p-4" [style.--i]="i" data-testid="saved-card">
                  <div class="flex items-start gap-3.5">
                    <a [routerLink]="['/profesional', s.professional.id]" tabindex="-1" aria-hidden="true">
                      <app-avatar [subject]="avatar(s.professional)" alt="" class="size-14 rounded-xl text-lg" />
                    </a>
                    <div class="min-w-0 flex-1">
                      <h3 class="truncate text-[17px] font-bold leading-6">
                        <a [routerLink]="['/profesional', s.professional.id]" class="hover:underline">{{ s.professional.displayName }}</a>
                      </h3>
                      <p class="truncate text-[14.5px] text-ink-soft">{{ service(s.professional) }}</p>
                      @if (note(s.availability); as text) {
                        <p class="mt-1.5 text-[14px] font-medium text-ink-soft" role="status">{{ text }}</p>
                      } @else {
                        <p class="mt-1.5 text-[14px] text-muted">
                          {{ coverage(s.professional) }}
                          @if (s.professional.availableToday) {
                            <span aria-hidden="true"> · </span><span class="font-semibold text-success-strong">Toma urgencias</span>
                          }
                        </p>
                      }
                    </div>
                    <app-save-professional [professionalId]="s.professional.id" [name]="s.professional.displayName" />
                  </div>
                  <div class="mt-3.5 flex flex-wrap items-center gap-2">
                    @if (s.canRequest) {
                      <button
                        type="button"
                        class="button-primary min-h-11 rounded-xl px-4 text-[15px] font-semibold"
                        [attr.aria-label]="'Pedir presupuesto a ' + s.professional.displayName"
                        (click)="ask(s)"
                      >
                        Pedir presupuesto
                      </button>
                    }
                    <a
                      [routerLink]="['/profesional', s.professional.id]"
                      class="button-secondary inline-flex min-h-11 items-center rounded-xl px-4 text-[15px] font-semibold text-ink"
                      >Ver perfil</a
                    >
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }
    </div>
  `,
})
export class MyProfessionalsPage {
  protected readonly store = inject(MyProfessionalsStore);
  private readonly auth = inject(AuthStore);
  private readonly request = inject(RequestStore);
  private readonly router = inject(Router);

  protected readonly f1 = oneDecimal;
  protected readonly date = formatPastDate;
  protected readonly isEmpty = computed(() => !this.store.hired().length && !this.store.saved().length);

  constructor() {
    // Siempre se relee al entrar: lo que cambió desde otra pantalla (guardar, un trabajo nuevo) se ve en el acto.
    effect(() => {
      if (this.auth.authenticated()) untracked(() => void this.store.load(true));
    });
  }

  protected avatar(p: ProfessionalSummary) {
    return avatarOf(p);
  }

  protected service(p: ProfessionalSummary): string {
    return p.headline || p.services.map((s) => s.name).slice(0, 2).join(' · ') || 'Profesional en Tandil';
  }

  protected coverage(p: ProfessionalSummary): string {
    return coverageText(p);
  }

  protected jobsLabel(n: number): string {
    return pluralize(n, 'trabajo realizado', 'trabajos realizados');
  }

  protected note(availability: HiredProfessional['availability']): string | null {
    return unavailableText(availability);
  }

  protected rehire(h: HiredProfessional): void {
    this.request.startRehire(h.professional, h.rehireServiceId);
    void this.router.navigate(['/solicitud']);
  }

  protected ask(s: SavedProfessional): void {
    this.request.startTargeted(s.professional);
    void this.router.navigate(['/solicitud']);
  }
}
