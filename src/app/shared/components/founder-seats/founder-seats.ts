import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FounderSeats as FounderSeatsInfo } from '../../../core/models/pro-analytics';
import { proPriceAmount } from '../../../core/utils/quote-usage';

/**
 * Precio fundador: el precio que garantizan los primeros lugares. Sin contador
 * de lugares (un "Quedan 30 de 30" dice que nadie contrató), sin temporizadores
 * ni cifras armadas: solo se muestra si quedan lugares REALES (cobros
 * confirmados, del backend) y no está apagado. A un fundador le confirma su precio.
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
        <b class="text-sm text-ink">Precio fundador</b>
        <p class="mt-1 text-sm leading-6 text-ink-soft">
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
  protected readonly amount = proPriceAmount;
}
