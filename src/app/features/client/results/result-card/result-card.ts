import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, hasLicenseFor } from '../../../../core/models/professional';
import { RequestStore } from '../../../../core/state/request.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';

/** Tarjeta de resultado — composición desktop. Solo datos reales del backend. */
@Component({
  selector: 'app-result-card',
  imports: [RouterLink, Avatar, Icon, VerifiedSeal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid grid-cols-[132px_minmax(0,1fr)] gap-5 rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] duration-150',
    '[class]': "selected() ? 'border-brand bg-brand-tint shadow-[0_0_0_1px_var(--color-brand)]' : 'border-line bg-white hover:border-line-dash'",
  },
  template: `
    <a [routerLink]="['/profesional', pro().id]" class="relative block h-38 w-33 overflow-hidden rounded-xl" [attr.aria-label]="'Ver perfil de ' + pro().displayName">
      <app-avatar [subject]="avatar()" alt="" class="flex! size-full font-display text-3xl" />
      @if (selected()) {
        <span class="absolute top-2 left-2 flex size-7 animate-pop items-center justify-center rounded-full border-2 border-white bg-brand text-[13px] font-bold text-white">
          {{ search.selectionNumber(pro().id) }}
        </span>
      }
    </a>

    <div class="flex min-w-0 flex-col gap-2.5">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.75">
            <a [routerLink]="['/profesional', pro().id]" class="text-xl font-semibold tracking-[-0.01em] text-ink hover:underline">{{ pro().displayName }}</a>
            @if (pro().verifications.identity) {
              <app-verified-seal [size]="17" />
            }
          </div>
          <div class="mt-0.5 text-sm text-muted">{{ subtitle() }}</div>
        </div>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.75 py-1.5 text-[13px] font-semibold transition-colors"
          [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-btn bg-white text-ink hover:border-brand hover:text-brand'"
          [attr.aria-pressed]="selected()"
          [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Comparar a ') + pro().displayName"
          (click)="search.toggleSelected(pro())"
        >
          <app-icon [name]="selected() ? 'check' : 'plus'" [size]="13" [stroke]="selected() ? 3.2 : 2.8" />
          {{ selected() ? 'Comparando' : 'Comparar' }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-x-4.5 gap-y-1.5 text-sm font-medium text-ink">
        @if (pro().averageRating !== null) {
          <span class="flex items-center gap-1.25">
            <span class="text-[15px] text-accent" aria-hidden="true">★</span><span class="font-bold">{{ f1(pro().averageRating!) }}</span>
            <span class="font-normal text-muted">({{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }})</span>
          </span>
        } @else {
          <span class="font-normal text-muted">Sin reseñas todavía</span>
        }
        @if (zones()) {
          <span class="flex min-w-0 items-center gap-1.25 text-ink-soft"><app-icon name="pin" [size]="14" class="text-muted" /><span class="sr-only">Trabaja en </span>{{ zones() }}</span>
        }
        <span class="flex items-center gap-1.5 font-semibold" [class]="pro().availableToday ? 'text-brand' : 'text-muted'">
          <span class="size-1.75 rounded-full" [class]="pro().availableToday ? 'bg-success' : 'bg-line-dash'" aria-hidden="true"></span>
          {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
        </span>
      </div>

      @if (trust().length) {
        <p class="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
          <app-icon name="shield" [size]="14" class="text-brand" />
          @for (t of trust(); track t; let last = $last) {
            <span class="font-medium text-brand">{{ t }}</span>
            @if (!last) { <span aria-hidden="true">·</span> }
          }
        </p>
      }

      @if (pro().bio) {
        <p class="line-clamp-2 text-sm leading-[1.45] text-pretty text-ink-soft">{{ pro().bio }}</p>
      }

      <div class="mt-0.5 flex items-center gap-2">
        <button type="button" class="h-10.5 rounded-xl bg-brand px-4.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-brand-dark" (click)="ask.emit(pro())">
          Solicitar presupuesto
        </button>
        <a [routerLink]="['/profesional', pro().id]" class="flex h-10.5 items-center rounded-xl px-3 text-[14.5px] font-semibold text-ink underline decoration-line-dash underline-offset-4 hover:decoration-ink">Ver perfil</a>
      </div>
    </div>
  `,
})
export class ResultCard {
  protected readonly search = inject(SearchStore);
  private readonly request = inject(RequestStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly ask = output<ProfessionalSummary>();

  protected readonly avatar = computed(() => avatarOf(this.pro()));
  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  protected readonly subtitle = computed(() => professionalSubtitle(this.pro()));
  protected readonly zones = computed(() => this.pro().zones.map((z) => z.name).join(', '));
  protected readonly trust = computed(() => trustBadges(this.pro(), this.search.licenseApplicable(), this.request.service()?.id));
  protected readonly f1 = oneDecimal;
}

/** "Electricista matriculado · 12 años": headline del profesional o sus servicios reales. */
export function professionalSubtitle(p: ProfessionalSummary): string {
  const what = p.headline || p.services.map((s) => s.name).join(', ');
  const years = p.yearsExperience ? `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'} de experiencia` : '';
  return [what, years].filter(Boolean).join(' · ');
}

/**
 * Señales públicas reales. La matrícula solo si el backend la tiene
 * verificada para el servicio (que el servicio la requiera no alcanza).
 */
export function trustBadges(p: ProfessionalSummary, licenseApplicable: boolean, serviceId?: string | null): string[] {
  const out: string[] = [];
  if (p.verifications.identity) out.push('Identidad verificada');
  if (licenseApplicable && hasLicenseFor(p, serviceId)) out.push('Matrícula verificada');
  if (p.completedJobsCount > 0) {
    out.push(`${p.completedJobsCount} ${p.completedJobsCount === 1 ? 'trabajo' : 'trabajos'} por Resuelve`);
  }
  return out;
}
