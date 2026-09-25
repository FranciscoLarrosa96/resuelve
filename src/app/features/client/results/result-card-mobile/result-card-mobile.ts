import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Professional } from '../../../../core/models/professional';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { CheckBadge } from '../../../../shared/components/check-badge/check-badge';
import { Icon } from '../../../../shared/components/icon/icon';

/** Tarjeta de resultado — composición mobile. */
@Component({
  selector: 'app-result-card-mobile',
  imports: [RouterLink, Avatar, CheckBadge, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative block animate-fade-in rounded-[22px] border-[1.5px] bg-white p-4 shadow-card-m transition-[border-color,box-shadow] duration-200',
    '[class.border-brand]': 'selected()',
    '[class.border-line]': '!selected()',
  },
  template: `
    <button
      type="button"
      class="absolute top-3.5 right-3.5 flex size-7.5 items-center justify-center rounded-[10px] border-[1.5px] transition-colors"
      [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-btn bg-white text-line-btn'"
      [attr.aria-pressed]="selected()"
      [attr.aria-label]="(selected() ? 'Quitar de la comparación a ' : 'Agregar a la comparación a ') + pro().name"
      (click)="search.toggleSelected(pro().id)"
    >
      <app-icon name="check" [size]="14" [stroke]="3.2" />
    </button>

    <a [routerLink]="['/profesional', pro().id]" class="flex items-center gap-3 pr-9">
      <app-avatar [subject]="pro()" [photo]="false" alt="" class="size-13.5 rounded-[17px] font-display text-[17px]" />
      <div class="min-w-0">
        <div class="text-[17px] font-semibold">{{ pro().name }}</div>
        <div class="text-[13.5px] text-muted">{{ pro().trade }}</div>
        <div class="mt-0.75 text-[13.5px] font-semibold">
          <span class="text-accent">★</span> {{ f1(pro().rating) }}
          <span class="font-normal text-muted">· {{ pro().reviewsCount }} opiniones</span>
        </div>
      </div>
    </a>

    <div class="mt-3 flex flex-wrap gap-1.5">
      <app-check-badge label="Identidad verificada" />
      @if (search.licenseApplicable() && pro().licenseVerified) {
        <app-check-badge [label]="pro().licenseLabel ?? 'Matrícula verificada'" />
      }
    </div>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1.5 rounded-[14px] bg-sand-light px-3 py-2.5 text-[13px] font-medium whitespace-nowrap text-ink-soft">
      <span class="flex items-center gap-1.25"><app-icon name="pin" [size]="13" [stroke]="2.4" class="text-muted" />{{ f1(pro().distanceKm) }} km</span>
      <span class="flex items-center gap-1.5" [class]="pro().availableToday ? 'text-brand' : 'text-muted'">
        <span class="size-1.75 rounded-full" [class]="pro().availableToday ? 'bg-success' : 'bg-[#C9B89A]'"></span>
        {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }}
      </span>
      <span class="flex items-center justify-end gap-1.25 text-right"><app-icon name="clock" [size]="13" [stroke]="2.4" class="text-muted" />Responde {{ pro().responseTime }}</span>
    </div>

    <div class="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
      <a
        [routerLink]="['/profesional', pro().id]"
        class="flex h-11.5 items-center justify-center rounded-[14px] border border-line-btn bg-white text-[14.5px] font-semibold text-ink"
      >Ver perfil</a>
      <button type="button" class="h-11.5 rounded-[14px] bg-brand text-[14.5px] font-semibold text-white" (click)="ask.emit(pro())">
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
