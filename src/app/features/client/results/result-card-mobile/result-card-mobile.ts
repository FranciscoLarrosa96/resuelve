import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { RequestStore } from '../../../../core/state/request.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { professionalSubtitle, trustBadges } from '../result-card/result-card';

/** Tarjeta de resultado — composición mobile. Solo datos reales del backend. */
@Component({
  selector: 'app-result-card-mobile',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block rounded-2xl border p-4 transition-[border-color,background-color] duration-150',
    '[class.border-brand]': 'selected()',
    '[class.bg-brand-tint]': 'selected()',
    '[class.border-line]': '!selected()',
    '[class.bg-white]': '!selected()',
  },
  template: `
    <button
      type="button"
      class="absolute top-3.5 right-3.5 flex size-7.5 items-center justify-center rounded-lg border-[1.5px] press"
      [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-btn bg-white text-line-btn'"
      [attr.aria-pressed]="selected()"
      [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Agregar a la comparación a ') + pro().displayName"
      (click)="search.toggleSelected(pro())"
    >
      <app-icon name="check" [size]="14" [stroke]="3.2" />
    </button>

    <a [routerLink]="['/profesional', pro().id]" class="flex items-center gap-3 pr-9">
      <app-avatar [subject]="avatar()" [photo]="!!pro().avatarUrl" alt="" class="size-13 shrink-0 rounded-xl text-[17px]" />
      <div class="min-w-0">
        <div class="text-[17px] font-semibold">{{ pro().displayName }}</div>
        <div class="line-clamp-1 text-[13.5px] text-muted">{{ subtitle() }}</div>
        <div class="mt-0.75 text-[13.5px] font-semibold">
          @if (pro().averageRating !== null) {
            <span class="text-accent" aria-hidden="true">★</span> {{ f1(pro().averageRating!) }}
            <span class="font-normal text-muted">· {{ pro().reviewsCount }} {{ pro().reviewsCount === 1 ? 'reseña' : 'reseñas' }}</span>
          } @else {
            <span class="font-normal text-muted">Sin reseñas todavía</span>
          }
        </div>
      </div>
    </a>

    <p class="mt-3 text-[13px] leading-relaxed text-ink-soft">
      <span class="font-semibold whitespace-nowrap" [class]="pro().availableToday ? 'text-brand' : 'text-muted'"
        ><span class="mr-1.5 inline-block size-1.75 -translate-y-px rounded-full" [class]="pro().availableToday ? 'bg-success' : 'bg-line-dash'" aria-hidden="true"></span
        >{{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}</span>
      @if (zones()) { <span>&nbsp;· {{ zones() }}</span> }
    </p>
    @if (trust().length) {
      <p class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-brand">
        <app-icon name="shield" [size]="13" />{{ trust().join(' · ') }}
      </p>
    }

    <div class="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
      <a [routerLink]="['/profesional', pro().id]" class="flex h-11.5 items-center justify-center rounded-xl border border-line-btn bg-white text-[14.5px] font-semibold text-ink press">Ver perfil</a>
      <button type="button" class="h-11.5 rounded-xl bg-brand text-[14.5px] font-semibold text-white press" (click)="ask.emit(pro())">Solicitar presupuesto</button>
    </div>
  `,
})
export class ResultCardMobile {
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
