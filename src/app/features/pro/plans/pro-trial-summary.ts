import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProTrialSummary } from '../../../core/models/pro-profile';
import { trialSummaryFacts } from '../../../core/utils/pro-value';

const DAY = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Argentina/Buenos_Aires',
});

/**
 * Lo que pasó durante la prueba de PRO, con sus números del período (frases de
 * `pro-value.ts`): solo lo que pasó, sin ceros, sin promesas ni "PRO lo causó".
 * Única fuente del resumen (aviso del panel y Mi plan); el CTA lo pone quien lo usa.
 */
@Component({
  selector: 'app-pro-trial-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-[14.5px] leading-6 text-ink-soft" data-testid="pro-trial-period">
      Tu prueba de Resuelve PRO fue del {{ from() }} al {{ to() }}.
      {{ facts().length ? 'En esos días:' : 'En esos días no registramos apariciones en Destacados, visitas ni solicitudes antes que Free.' }}
    </p>
    @if (facts().length) {
      <ul class="mt-3 grid gap-2.5">
        @for (f of facts(); track f.text) {
          <li class="flex items-baseline gap-2.5 text-[15px] leading-6 text-ink" data-testid="pro-trial-fact">
            <b class="min-w-7 text-[22px] font-bold text-brand tabular-nums">{{ f.value }}</b>
            <span>{{ f.text }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ProTrialSummaryView {
  readonly summary = input.required<ProTrialSummary>();

  protected readonly facts = computed(() => trialSummaryFacts(this.summary()));
  protected readonly from = computed(() => DAY.format(new Date(this.summary().startedAt)));
  /** Último día con PRO (el fin es exclusivo: termina a esa hora). */
  protected readonly to = computed(() => DAY.format(new Date(new Date(this.summary().endsAt).getTime() - 1)));
}
