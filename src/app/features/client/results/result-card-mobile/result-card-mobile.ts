import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Professional } from '../../../../core/models/professional';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';

/** Tarjeta de resultado — composición mobile. */
@Component({
  selector: 'app-result-card-mobile',
  imports: [RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative block rounded-2xl border p-4 transition-[border-color,background-color] duration-150',
    '[class.border-brand]': 'selected()',
    '[class.bg-brand-tint]': 'selected()',
    '[class.border-line]': '!selected()',
    '[class.bg-white]': '!selected()',
  },
  template: `
    <button
      type="button"
      class="absolute top-3.5 right-3.5 flex size-7.5 items-center justify-center rounded-lg border-[1.5px] transition-colors"
      [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-btn bg-white text-line-btn'"
      [attr.aria-pressed]="selected()"
      [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Agregar a la comparación a ') + pro().name"
      (click)="search.toggleSelected(pro().id)"
    >
      <app-icon name="check" [size]="14" [stroke]="3.2" />
    </button>

    <a [routerLink]="['/profesional', pro().id]" class="flex items-center gap-3 pr-9">
      <app-avatar [subject]="pro()" [photo]="false" alt="" class="size-13 rounded-xl font-display text-[17px]" />
      <div class="min-w-0">
        <div class="text-[17px] font-semibold">{{ pro().name }}</div>
        <div class="text-[13.5px] text-muted">{{ pro().trade }}</div>
        <div class="mt-0.75 text-[13.5px] font-semibold">
          <span class="text-accent">★</span> {{ f1(pro().rating) }}
          <span class="font-normal text-muted">· {{ pro().reviewsCount }} opiniones</span>
        </div>
      </div>
    </a>

    <p class="mt-3 text-[13px] leading-relaxed text-ink-soft">
      <span class="font-semibold whitespace-nowrap" [class]="pro().availableToday ? 'text-brand' : 'text-muted'"
        ><span class="mr-1.5 inline-block size-1.75 -translate-y-px rounded-full" [class]="pro().availableToday ? 'bg-success' : 'bg-line-dash'" aria-hidden="true"></span
        >{{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}&nbsp;·</span>
      <span class="whitespace-nowrap">{{ f1(pro().distanceKm) }} km&nbsp;·</span>
      <span class="whitespace-nowrap">responde {{ pro().responseTime }}</span>
    </p>
    <p class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-brand">
      <app-icon name="shield" [size]="13" />
      Identidad{{ search.licenseApplicable() && pro().licenseVerified ? ' y matrícula verificadas' : ' verificada' }}
    </p>

    <div class="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
      <a
        [routerLink]="['/profesional', pro().id]"
        class="flex h-11.5 items-center justify-center rounded-xl border border-line-btn bg-white text-[14.5px] font-semibold text-ink"
      >Ver perfil</a>
      <button type="button" class="h-11.5 rounded-xl bg-brand text-[14.5px] font-semibold text-white" (click)="ask.emit(pro())">
        Solicitar presupuesto
      </button>
    </div>
  `,
})
export class ResultCardMobile {
  protected readonly search = inject(SearchStore);
  readonly pro = input.required<Professional>();
  readonly ask = output<Professional>();

  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  protected readonly f1 = oneDecimal;
}
