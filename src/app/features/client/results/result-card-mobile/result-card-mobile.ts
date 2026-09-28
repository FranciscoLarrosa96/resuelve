import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText } from '../../../../core/models/professional';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../../shared/components/plan-badges/plan-badges';
import { Tag } from '../../../../shared/components/tag/tag';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';
import { professionalSubtitle, trustSignals } from '../result-card/result-card';

/** Tarjeta de resultado — composición mobile. Solo datos reales del backend. */
@Component({
  selector: 'app-result-card-mobile',
  imports: [RouterLink, Avatar, Icon, ProBadge, FeaturedLabel, Tag, VerifiedSeal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex flex-col rounded-2xl border p-4 transition-[border-color,background-color] duration-150',
    '[class]': "selected() ? 'border-brand bg-brand-tint' : pro().isFeaturedPlacement ? 'border-brand bg-surface shadow-[inset_4px_0_0_0_var(--color-brand)] pl-5' : pro().pro ? 'border-brand-line bg-surface' : 'border-line bg-surface'",
  },
  template: `
    @if (pro().isFeaturedPlacement) {
      <app-featured-label class="mb-2" />
    }
    <div class="flex items-start gap-3">
      <a [routerLink]="['/profesional', pro().id]" class="flex min-w-0 flex-1 items-start gap-3">
        <app-avatar [subject]="avatar()" [photo]="!!pro().avatarUrl" alt="" class="size-12 shrink-0 rounded-xl text-base" />
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5 text-[16.5px] leading-5.5 font-semibold">
            {{ pro().displayName }}
            @if (pro().verifications.identity) { <app-verified-seal [size]="14" /> }
            @if (pro().pro) { <app-pro-badge /> }
          </div>
          <div class="mt-0.5 line-clamp-1 text-[13.5px] text-muted">{{ subtitle() }}</div>
        </div>
      </a>
      <button
        type="button"
        class="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg press"
        [attr.aria-pressed]="selected()"
        [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Agregar a la comparación a ') + pro().displayName"
        (click)="search.toggleSelected(pro())"
      >
        <span class="flex size-6 items-center justify-center rounded-md border-[1.5px]" [class]="selected() ? 'border-brand bg-primary text-white' : 'border-line-btn bg-surface text-transparent'" aria-hidden="true">
          <app-icon name="check" [size]="13" [stroke]="3.2" />
        </span>
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13.5px]">
      @if (pro().averageRating !== null) {
        <span><span class="text-accent" aria-hidden="true">★</span> <span class="font-bold">{{ f1(pro().averageRating!) }}</span>
          <span class="text-muted"> · {{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span></span>
      } @else {
        <span class="text-muted">Sin reseñas todavía</span>
      }
      <span class="flex items-center gap-1.5 font-semibold whitespace-nowrap" [class]="pro().availableToday ? 'text-brand' : 'text-muted'">
        <span class="size-2 rounded-full" [class]="pro().availableToday ? 'bg-success' : 'border border-line-dash'" aria-hidden="true"></span>
        {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
      </span>
    </div>
    @if (zones()) {
      <p class="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-ink-soft">
        <app-icon name="pin" [size]="13" class="text-subtle" /><span class="sr-only">Trabaja en </span><span class="truncate">{{ zones() }}</span>
      </p>
    }
    @if (trust().length) {
      <div class="mt-2.5 flex flex-wrap gap-1.5">
        @for (t of trust(); track t.label) {
          <app-tag [tone]="t.tone" [icon]="t.icon">{{ t.label }}</app-tag>
        }
      </div>
    }

    <div class="mt-auto grid grid-cols-[1fr_1.4fr] gap-2 pt-3.5">
      <a [routerLink]="['/profesional', pro().id]" class="flex h-11 items-center justify-center rounded-xl border border-line-btn bg-surface text-[14.5px] font-semibold text-ink press">Ver perfil</a>
      <button type="button" class="h-11 rounded-xl bg-primary text-[14.5px] font-semibold text-white press" (click)="ask.emit(pro())">Solicitar presupuesto</button>
    </div>
  `,
})
export class ResultCardMobile {
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
