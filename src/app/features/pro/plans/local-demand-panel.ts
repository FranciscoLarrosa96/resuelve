import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { monthName } from '../../../core/utils/month-analytics';
import { demandFacts } from '../../../core/utils/pro-value';

/**
 * "La demanda en tu zona": cuántos pedidos hubo en el mes de sus servicios en su ciudad
 * principal, cuántos le llegaron, cuántos ya tenían presupuesto antes de que Free pudiera
 * verlos y cuántos PRO ofrecen lo mismo. Agregado y anónimo (mínimo de muestra en el
 * backend); sin base suficiente no se muestra. Free y PRO (Tu mes y Mi plan).
 */
@Component({
  selector: 'app-local-demand-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <section class="border-t border-line pt-5" aria-labelledby="demand-title" data-testid="local-demand">
        <p class="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">
          La demanda en tu zona · {{ month() }}
        </p>
        <h2 id="demand-title" class="mt-1 font-sans text-[21px] leading-tight font-bold tracking-[-0.01em] text-ink">
          {{ v.title }}
        </h2>
        <ul class="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-3">
          @for (f of v.facts; track f.text) {
            <li class="flex items-baseline gap-2.5 text-[15px] leading-6 text-ink" data-testid="local-demand-fact">
              <b class="min-w-7 text-[22px] font-bold text-brand tabular-nums">{{ f.value }}</b>
              <span>{{ f.text }}</span>
            </li>
          }
        </ul>
        <p class="mt-3 text-[13px] text-muted">
          Pedidos publicados por clientes en Resuelve, contados en total: nunca mostramos quién pidió ni a
          quién le llegó.
        </p>
      </section>
    }
  `,
})
export class LocalDemandPanel {
  readonly data = input.required<MonthAnalytics>();
  protected readonly view = computed(() => demandFacts(this.data()));
  protected readonly month = computed(() => monthName(this.data().period));
}
