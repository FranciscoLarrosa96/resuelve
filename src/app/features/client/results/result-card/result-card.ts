import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText, hasLicenseFor } from '../../../../core/models/professional';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../../shared/components/plan-badges/plan-badges';
import { Tag, TagTone } from '../../../../shared/components/tag/tag';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';

/**
 * Tarjeta de resultado — composición desktop, en fila: identidad | señales |
 * acciones. Se lee de izquierda a derecha: quién es, qué hace, si inspira
 * confianza, si está disponible y dónde trabaja. Solo datos reales.
 */
@Component({
  selector: 'app-result-card',
  imports: [RouterLink, Avatar, Icon, VerifiedSeal, ProBadge, FeaturedLabel, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid grid-cols-[64px_minmax(0,1fr)_196px] gap-x-4.5 rounded-2xl border px-5 py-4.5 transition-[border-color,box-shadow,background-color] duration-150',
    '[class]': "selected() ? 'border-brand bg-brand-tint shadow-[0_0_0_1px_var(--color-brand)]' : pro().isFeaturedPlacement ? 'border-brand bg-white shadow-[inset_4px_0_0_0_var(--color-brand)] hover:bg-brand-tint' : pro().pro ? 'border-brand-line bg-white hover:border-brand' : 'border-line bg-white hover:border-line-dash'",
  },
  template: `
    <a [routerLink]="['/profesional', pro().id]" class="relative block size-16 self-start" tabindex="-1" aria-hidden="true">
      <app-avatar [subject]="avatar()" alt="" class="flex! size-16 rounded-xl text-xl" />
      @if (selected()) {
        <span class="absolute -top-1.5 -right-1.5 flex size-6 animate-pop items-center justify-center rounded-full border-2 border-white bg-brand text-[12px] font-bold text-white">
          {{ search.selectionNumber(pro().id) }}
        </span>
      }
    </a>

    <div class="flex min-w-0 flex-col">
      @if (pro().isFeaturedPlacement) {
        <app-featured-label class="mb-1.5" />
      }
      <div class="flex flex-wrap items-center gap-x-1.75 gap-y-1">
        <a [routerLink]="['/profesional', pro().id]" class="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-ink hover:underline">{{ pro().displayName }}</a>
        @if (pro().verifications.identity) {
          <app-verified-seal [size]="16" />
        }
        @if (pro().pro) {
          <app-pro-badge />
        }
      </div>
      <div class="mt-0.5 truncate text-[14px] text-muted">{{ subtitle() }}</div>

      <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px]">
        @if (pro().averageRating !== null) {
          <span class="flex items-center gap-1">
            <span class="text-[15px] leading-none text-accent" aria-hidden="true">★</span>
            <span class="font-bold text-ink">{{ f1(pro().averageRating!) }}</span>
            <span class="text-muted">· {{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span>
          </span>
        } @else {
          <span class="text-muted">Sin reseñas todavía</span>
        }
        <span class="flex items-center gap-1.5 font-semibold" [class]="pro().availableToday ? 'text-brand' : 'text-muted'">
          <span class="size-2 rounded-full" [class]="pro().availableToday ? 'bg-success' : 'border border-line-dash'" aria-hidden="true"></span>
          {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
        </span>
        @if (zones()) {
          <span class="flex min-w-0 items-center gap-1 text-ink-soft">
            <app-icon name="pin" [size]="14" class="text-subtle" /><span class="sr-only">Trabaja en </span><span class="truncate">{{ zones() }}</span>
          </span>
        }
      </div>

      @if (trust().length) {
        <div class="mt-2.5 flex flex-wrap gap-1.5">
          @for (t of trust(); track t.label) {
            <app-tag [tone]="t.tone" [icon]="t.icon">{{ t.label }}</app-tag>
          }
        </div>
      }

      @if (pro().bio) {
        <p class="mt-2.5 line-clamp-2 text-[14px] leading-[1.45] text-pretty text-ink-soft">{{ pro().bio }}</p>
      }
    </div>

    <div class="flex flex-col gap-2 border-l border-line-soft pl-4.5">
      <button type="button" class="h-10.5 rounded-xl bg-brand px-3 text-[14px] whitespace-nowrap font-semibold text-white hover:bg-brand-dark press" (click)="ask.emit(pro())">
        Solicitar presupuesto
      </button>
      <a [routerLink]="['/profesional', pro().id]" class="flex h-10.5 items-center justify-center rounded-xl border border-line-btn bg-white text-[14px] font-semibold text-ink hover:bg-sand-light press">Ver perfil</a>
      <button
        type="button"
        class="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold press"
        [class]="selected() ? 'bg-brand-soft text-brand-dark' : 'text-ink-soft hover:bg-sand-light'"
        [attr.aria-pressed]="selected()"
        [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Comparar a ') + pro().displayName"
        (click)="search.toggleSelected(pro())"
      >
        <span class="flex size-4 items-center justify-center rounded-sm border-[1.5px]" [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-dash bg-white text-transparent'" aria-hidden="true">
          <app-icon name="check" [size]="10" [stroke]="3.6" />
        </span>
        {{ selected() ? 'Comparando' : 'Comparar' }}
      </button>
    </div>
  `,
})
export class ResultCard {
  protected readonly search = inject(SearchStore);
  private readonly pros = inject(ProfessionalsStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly ask = output<ProfessionalSummary>();

  protected readonly avatar = computed(() => avatarOf(this.pro()));
  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  protected readonly subtitle = computed(() => professionalSubtitle(this.pro()));
  protected readonly zones = computed(() => coverageText(this.pro()));
  protected readonly trust = computed(() =>
    trustSignals(this.pro(), this.search.licenseApplicable(), this.pros.filters().serviceId),
  );
  protected readonly f1 = oneDecimal;
}

/** "Electricista matriculado · 12 años de experiencia": headline del profesional o sus servicios reales. */
export function professionalSubtitle(p: ProfessionalSummary): string {
  const what = p.headline || p.services.map((s) => s.name).join(', ');
  const years = p.yearsExperience ? `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'} de experiencia` : '';
  return [what, years].filter(Boolean).join(' · ');
}

export interface TrustSignal {
  label: string;
  icon: IconName;
  tone: TagTone;
}

/**
 * Señales públicas reales. La matrícula solo si el backend la tiene
 * verificada para el servicio (que el servicio la requiera no alcanza).
 */
export function trustSignals(p: ProfessionalSummary, licenseApplicable: boolean, serviceId?: string | null): TrustSignal[] {
  const out: TrustSignal[] = [];
  if (licenseApplicable && hasLicenseFor(p, serviceId)) out.push({ label: 'Matrícula verificada', icon: 'shield', tone: 'brand' });
  if (p.verifications.identity) out.push({ label: 'Identidad verificada', icon: 'check', tone: 'brand' });
  if (p.completedJobsCount > 0) {
    out.push({
      label: `${p.completedJobsCount} ${p.completedJobsCount === 1 ? 'trabajo' : 'trabajos'} por Resuelve`,
      icon: 'briefcase',
      tone: 'neutral',
    });
  }
  return out;
}
