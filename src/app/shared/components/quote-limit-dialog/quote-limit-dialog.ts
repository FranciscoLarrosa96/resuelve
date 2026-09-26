import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlansStore } from '../../../core/state/plans.store';
import { proPriceText } from '../../../core/utils/quote-usage';
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
      <h2 id="quote-limit-title" class="font-display text-[23px] font-bold tracking-[-0.02em]">Llegaste al límite de Free</h2>
      <div id="quote-limit-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
        <p>Este mes ya respondiste {{ limit() }} solicitudes.</p>
        <p class="mt-2">
          Podés seguir viendo y recibiendo pedidos. Con Resuelve PRO podés enviar presupuestos sin límite y acceder a más
          visibilidad y análisis.
        </p>
      </div>
      <div class="mt-4 rounded-xl border border-brand bg-brand-tint px-4 py-3">
        <p class="text-[14px] font-semibold text-brand-dark">Resuelve PRO</p>
        @if (price(); as p) {
          <p class="mt-0.5 text-[20px] font-bold text-ink tabular-nums">{{ p }}</p>
        }
      </div>
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand" (click)="dismiss.emit()">
          Seguir con Free
        </button>
        <a routerLink="/pro/plan" class="flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark press" (click)="dismiss.emit()">
          Conocer PRO
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

  protected readonly price = computed(() => {
    const ars = this.plans.info()?.pro.monthlyPriceArs;
    return ars ? proPriceText(ars) : null;
  });

  constructor() {
    this.plans.load();
  }
}
