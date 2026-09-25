import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Professional } from '../../../../core/models/professional';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon } from '../../../../shared/components/icon/icon';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';

/** Tarjeta de resultado — composición desktop (foto grande + datos). */
@Component({
  selector: 'app-result-card',
  imports: [RouterLink, Avatar, Icon, VerifiedSeal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid grid-cols-[132px_minmax(0,1fr)] gap-5 rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] duration-150',
    '[class]': "selected() ? 'border-brand bg-brand-tint shadow-[0_0_0_1px_var(--color-brand)]' : hovered() ? 'border-line-dash bg-white' : 'border-line bg-white'",
    '(mouseenter)': 'search.hoverId.set(pro().id)',
    '(mouseleave)': 'search.hoverId.set(null)',
  },
  template: `
    <a
      [routerLink]="['/profesional', pro().id]"
      class="relative block h-38 w-33 overflow-hidden rounded-xl"
      [attr.aria-label]="'Ver perfil de ' + pro().name"
    >
      <app-avatar [subject]="pro()" alt="" class="flex! size-full font-display text-3xl" />
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
            <a [routerLink]="['/profesional', pro().id]" class="text-xl font-semibold tracking-[-0.01em] text-ink hover:underline">{{ pro().name }}</a>
            <app-verified-seal [size]="17" />
          </div>
          <div class="mt-0.5 text-sm text-muted">{{ pro().trade }} · {{ pro().yearsExperience }} años de experiencia</div>
        </div>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-lg border px-2.75 py-1.5 text-[13px] font-semibold transition-colors"
          [class]="selected() ? 'border-brand bg-brand text-white' : 'border-line-btn bg-white text-ink hover:border-brand hover:text-brand'"
          [attr.aria-pressed]="selected()"
          (click)="search.toggleSelected(pro().id)"
        >
          <app-icon [name]="selected() ? 'check' : 'plus'" [size]="13" [stroke]="selected() ? 3.2 : 2.8" />
          {{ selected() ? 'Comparando' : 'Comparar' }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-x-4.5 gap-y-1.5 text-sm font-medium text-ink">
        <span class="flex items-center gap-1.25">
          <span class="text-[15px] text-accent">★</span><span class="font-bold">{{ f1(pro().rating) }}</span>
          <span class="font-normal text-muted">({{ pro().reviewsCount }} opiniones)</span>
        </span>
        <span class="flex items-center gap-1.25 text-ink-soft"><app-icon name="pin" [size]="14" class="text-muted" />{{ f1(pro().distanceKm) }} km</span>
        <span class="flex items-center gap-1.25 text-ink-soft"><app-icon name="clock" [size]="14" class="text-muted" />Responde {{ pro().responseTime }}</span>
        <span class="flex items-center gap-1.5 font-semibold" [class]="pro().availableToday ? 'text-brand' : 'text-muted'">
          <span class="size-1.75 rounded-full" [class]="pro().availableToday ? 'bg-success' : 'bg-line-dash'" aria-hidden="true"></span>
          {{ pro().availableToday ? 'Disponible hoy' : 'No disponible hoy' }} · {{ pro().nextSlot }}
        </span>
      </div>

      <p class="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
        <app-icon name="shield" [size]="14" class="text-brand" />
        <span class="font-medium text-brand">Identidad verificada</span>
        @if (search.licenseApplicable() && pro().licenseVerified) {
          <span aria-hidden="true">·</span><span class="font-medium text-brand">{{ pro().licenseLabel ?? 'Matrícula verificada' }}</span>
        }
        <span aria-hidden="true">·</span><span>{{ pro().jobsCount }} trabajos por Resuelve</span>
      </p>

      <p class="text-sm leading-[1.45] text-pretty text-ink-soft">“{{ pro().highlight }}”</p>

      <div class="mt-0.5 flex items-center gap-2">
        <button type="button" class="h-10.5 rounded-xl bg-brand px-4.5 text-[14.5px] font-semibold text-white transition-colors hover:bg-brand-dark" (click)="ask.emit(pro())">
          Solicitar presupuesto
        </button>
        <a
          [routerLink]="['/profesional', pro().id]"
          class="flex h-10.5 items-center rounded-xl px-3 text-[14.5px] font-semibold text-ink underline decoration-line-dash underline-offset-4 hover:decoration-ink"
        >Ver perfil</a>
      </div>
    </div>
  `,
})
export class ResultCard {
  protected readonly search = inject(SearchStore);
  readonly pro = input.required<Professional>();
  readonly ask = output<Professional>();

  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  protected readonly hovered = computed(() => this.search.hoverId() === this.pro().id);
  protected readonly f1 = oneDecimal;
}
