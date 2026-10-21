import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FounderSeats as FounderSeatsInfo } from '../../../core/models/pro-analytics';
import { proPriceAmount } from '../../../core/utils/quote-usage';

/**
 * Precio fundador: lugares REALES que quedan (cobros confirmados, del backend)
 * y el precio que garantizan. Sin temporizadores ni cifras armadas: si no hay
 * lugares o está apagado, no se muestra. A un fundador le confirma su precio.
 */
@Component({
  selector: 'app-founder-seats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ownPrice(); as own) {
      <p class="rounded-xl border border-brand-line bg-surface px-4 py-3 text-sm leading-6 text-ink-soft" data-testid="founder-own">
        <b class="text-ink">Tenés precio fundador:</b> {{ amount(own) }}/mes garantizado, aunque el precio de PRO suba.
      </p>
    } @else if (seats(); as s) {
      <div class="rounded-xl border border-brand-line bg-surface px-4 py-3" data-testid="founder-seats">
        <p class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <b class="text-sm text-ink">Precio fundador</b>
          <span class="text-sm font-semibold text-brand tabular-nums">Quedan {{ s.remaining }} de {{ s.slots }} lugares</span>
        </p>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div class="h-full rounded-full bg-primary" [style.width.%]="takenPercent()"></div>
        </div>
        <p class="mt-2 text-sm leading-6 text-ink-soft">
          Los primeros {{ s.slots }} profesionales que contratan PRO mantienen {{ amount(s.priceArs) }}/mes aunque el precio suba.
        </p>
        <p class="mt-1 text-xs text-muted">Un lugar se ocupa cuando se confirma el primer pago.</p>
      </div>
    }
  `,
})
export class FounderSeats {
  readonly info = input<FounderSeatsInfo | null | undefined>(null);
  /** Precio fundador de quien mira (si ya lo tiene). */
  readonly ownFounderPrice = input<number | null | undefined>(null);

  protected readonly ownPrice = computed(() => this.ownFounderPrice() ?? null);
  protected readonly seats = computed(() => {
    const s = this.info();
    return s && s.slots > 0 && s.remaining > 0 ? s : null;
  });
  /** Siempre se ve algo de barra: un lugar ocupado o ninguno no son "lleno". */
  protected readonly takenPercent = computed(() => {
    const s = this.seats();
    return s ? Math.max(4, Math.min(100, (s.taken / s.slots) * 100)) : 0;
  });
  protected readonly amount = proPriceAmount;
}
