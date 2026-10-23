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
      <p class="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-sm leading-6 text-accent-ink" data-testid="founder-own">
        <b>Tenés precio fundador:</b> {{ amount(own) }}/mes garantizado, aunque el precio de PRO suba.
      </p>
    } @else if (seats(); as s) {
      <div class="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-accent-ink" data-testid="founder-seats">
        <span class="rounded-full bg-accent-fill px-2.5 py-0.5 text-xs font-bold text-on-primary">Precio fundador</span>
        <p class="mt-2 text-sm leading-6">
          Los primeros {{ s.slots }} profesionales que contratan PRO <b>mantienen {{ amount(s.priceArs) }}/mes</b> aunque el precio suba.
        </p>
        <p class="mt-1 text-xs text-ink-soft">Un lugar se ocupa cuando se confirma el primer pago.</p>
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
