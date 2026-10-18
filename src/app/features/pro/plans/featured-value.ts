import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { featuredValueFacts } from '../../../core/utils/pro-value';

/** Misma evidencia en Tu mes y Mi plan. Sin embudo ni tasas: no son una cohorte. */
@Component({
  selector: 'app-featured-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (facts().length) {
      <div class="mt-4" data-testid="featured-value">
        <h3 class="text-[16px] font-semibold text-ink">Tu presencia en Destacados</h3>
        <p class="mt-1 text-[14px] leading-6 text-ink-soft">
          Un espacio para mostrar tu perfil y las fotos de tus trabajos cuando buscan tus servicios.
        </p>
        <ul class="mt-3 grid gap-3 sm:grid-cols-3">
          @for (f of facts(); track f.text) {
            <li class="border-l-2 border-brand pl-3" data-testid="featured-value-fact">
              <b class="block text-[26px] leading-8 font-bold text-ink tabular-nums">{{ f.value }}</b>
              <span class="text-[14px] leading-5 text-ink-soft">{{ f.text }}</span>
            </li>
          }
        </ul>
        <p class="mt-3 text-[13px] leading-5 text-muted">
          Cada cifra cuenta lo registrado en el período elegido. Un presupuesto aceptado puede venir
          de una solicitud de otro mes; estos números no forman una tasa de conversión.
        </p>
        <p class="mt-2 text-[13px] leading-5 text-muted">
          Las visitas al perfil y los toques en WhatsApp o Llamar se muestran en el total de tu perfil:
          todavía no podemos identificar cuáles vinieron de Destacados. Eso no significa que sean cero.
        </p>
      </div>
    }
  `,
})
export class FeaturedValue {
  readonly data = input.required<MonthAnalytics>();
  protected readonly facts = computed(() => featuredValueFacts(this.data()));
}
