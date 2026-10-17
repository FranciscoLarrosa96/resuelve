import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { interestSummary } from '../../../core/utils/month-analytics';
import { acceptedQuotesAmount, withoutProFacts } from '../../../core/utils/pro-value';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * Sin PRO, con los números del propio profesional: solicitudes que le llegaron después
 * que a PRO, las que no pudo responder por el cupo y lo que le aceptaron contra el precio.
 * Solo hechos registrados; si no pasó nada de eso, dice qué suma PRO sin inventar cifras.
 * Única fuente en Tu mes y Mi plan.
 */
@Component({
  selector: 'app-without-pro-panel',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-2xl border border-brand-line bg-brand-tint px-5 py-4.5"
      aria-labelledby="without-pro-title"
      data-testid="without-pro"
    >
      <p class="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">{{ eyebrow() }}</p>
      @if (interest(); as i) {
        <p class="mt-1.5 text-[15px] leading-6 text-ink" data-testid="without-pro-interest">
          {{ i }}
          <span class="block text-[13px] text-muted">Un toque no confirma que se hayan comunicado.</span>
        </p>
      }
      <h2 id="without-pro-title" [class.mt-3]="!!interest()" [class.mt-1]="!interest()" class="font-sans text-[19px] font-bold tracking-[-0.01em] text-ink">
        {{ facts().length ? 'Lo que pasó sin PRO este mes' : 'Lo que sumarías con PRO' }}
      </h2>
      @if (facts().length) {
        <ul class="mt-3 grid gap-2.5">
          @for (f of facts(); track f.text) {
            <li class="flex items-baseline gap-2.5 text-[15px] leading-6 text-ink" data-testid="without-pro-fact">
              <b class="min-w-7 text-[22px] font-bold text-brand tabular-nums">{{ f.value }}</b>
              <span>{{ f.text }}</span>
            </li>
          }
        </ul>
      } @else {
        <ul class="mt-3 grid gap-1.5 text-[14.5px] text-ink sm:grid-cols-2">
          <li class="flex items-center gap-2">
            <app-icon name="clock" [size]="15" [stroke]="1.9" class="text-brand" />Las solicitudes nuevas te
            llegan antes
          </li>
          <li class="flex items-center gap-2">
            <app-icon name="infinity" [size]="15" [stroke]="1.9" class="text-brand" />Respondés sin el límite
            de Free
          </li>
          <li class="flex items-center gap-2">
            <app-icon name="funnel" [size]="15" [stroke]="1.9" class="text-brand" />Ves desde qué barrios y
            servicios te encuentran
          </li>
          <li class="flex items-center gap-2">
            <app-icon name="chat" [size]="15" [stroke]="1.9" class="text-brand" />Comparás cada mes con el
            anterior
          </li>
        </ul>
      }
      @if (money(); as m) {
        <p class="mt-3.5 border-t border-brand-line pt-3 text-[15px] leading-6 text-ink" data-testid="accepted-quotes">
          Este mes te aceptaron <b class="tabular-nums">{{ m }}</b> en presupuestos.
          <span class="block text-[13px] text-muted"
            >Es la suma de lo acordado en Resuelve, no necesariamente lo que cobraste.</span
          >
        </p>
      }
      @if (cta()) {
        <a
          routerLink="/pro/plan"
          class="button-primary mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold"
          >Conocer PRO <app-icon name="arrow-right" [size]="13" [stroke]="2.4"
        /></a>
      }
    </section>
  `,
})
export class WithoutProPanel {
  readonly data = input.required<MonthAnalytics>();
  /** false en Mi plan (ya está la contratación ahí). */
  readonly cta = input(true);
  readonly eyebrow = input('Tu mes en Free');
  /** Visitas y toques del mes (mismos totales de Tu mes); solo en Mi plan, donde Tu mes no está al lado. */
  readonly showInterest = input(false);

  protected readonly facts = computed(() => withoutProFacts(this.data()));
  protected readonly money = computed(() => acceptedQuotesAmount(this.data()));
  protected readonly interest = computed(() => {
    const d = this.data();
    return this.showInterest() && d.proPreview ? interestSummary(d.proPreview, d.period.isCurrent) : null;
  });
}
