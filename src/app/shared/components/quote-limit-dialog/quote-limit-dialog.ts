import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlansStore } from '../../../core/state/plans.store';
import { FREE_LIMIT_COPY, WANT_PRO_LINK, proPriceAmount } from '../../../core/utils/quote-usage';
import { Dialog } from '../dialog/dialog';

/**
 * Intento de responder una solicitud nueva con el cupo FREE agotado (el
 * backend respondió o respondería FREE_QUOTE_LIMIT_REACHED). Explica sin
 * castigar: sigue recibiendo pedidos; PRO saca el tope. Bottom sheet en mobile.
 */
@Component({
  selector: 'app-quote-limit-dialog',
  imports: [Dialog, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog [open]="open()" labelledBy="quote-limit-title" describedBy="quote-limit-text" (dismiss)="dismiss.emit()">
      <h2 id="quote-limit-title" class="font-display text-[23px] font-bold tracking-[-0.02em]">{{ copy.title }}</h2>
      <div id="quote-limit-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
        <p>Este mes ya respondiste {{ limit() }} solicitudes. {{ copy.body }}</p>
        <p class="mt-2 font-medium text-ink">{{ copy.pro }}</p>
      </div>
      @if (price(); as p) {
        <div class="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-brand bg-brand-tint px-4 py-3">
          <p class="text-[14px] font-semibold text-brand-dark">Resuelve PRO</p>
          <p><span class="text-[20px] font-bold text-ink tabular-nums">{{ p }}</span><span class="text-[14px] text-muted"> / mes</span></p>
        </div>
      }
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand" (click)="dismiss.emit()">
          {{ copy.stay }}
        </button>
        <a [routerLink]="want.path" [queryParams]="want.query" class="flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark press" (click)="dismiss.emit()">
          {{ copy.cta }}
        </a>
      </div>
    </app-dialog>
  `,
})
export class QuoteLimitDialog {
  private readonly plans = inject(PlansStore);

  readonly open = input.required<boolean>();
  /** Cupo mensual FREE (del uso real del backend). */
  readonly limit = input.required<number>();
  readonly dismiss = output<void>();

  protected readonly copy = FREE_LIMIT_COPY;
  protected readonly want = WANT_PRO_LINK;
  protected readonly price = computed(() => {
    const ars = this.plans.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(ars) : null;
  });

  constructor() {
    this.plans.load();
  }
}
