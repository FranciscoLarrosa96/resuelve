import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PlanChange } from '../../../core/models/billing';
import { BillingStore } from '../../../core/state/billing.store';
import { TransferStore } from '../../../core/state/transfer.store';
import { billingDate } from '../../../core/utils/billing-copy';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { Icon } from '../../../shared/components/icon/icon';

/** Gestiona únicamente cambios históricos ya contratados; no ofrece otro plan. */
@Component({
  selector: 'app-pro-plan-change-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pending(); as c) {
      <section id="cambio-de-plan" class="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-labelledby="plan-change-title" data-testid="plan-change" [attr.data-state]="c.state">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Cambio de plan</p>
        <h2 id="plan-change-title" class="mt-1 font-sans text-[22px] font-bold text-ink" data-testid="plan-change-title">{{ c.state === 'REVERTING' ? 'Estamos cancelando el cambio de cobro' : 'Tu próximo período de PRO' }}</h2>
        <ol class="mt-4 grid gap-2.5" aria-label="Estado del cambio">
          @for (step of steps(c); track step.key) {
            <li class="flex items-start gap-3 rounded-xl border px-3.5 py-3" [class]="step.done ? 'border-success-line bg-success-soft' : step.current ? 'border-info-line bg-info-soft' : 'border-line'" [attr.data-step]="step.key" [attr.data-done]="step.done" [attr.aria-current]="step.current ? 'step' : null">
              <app-icon [name]="step.done ? 'check-circle' : step.current ? 'clock' : 'hourglass'" [size]="20" [stroke]="2" class="mt-0.5 shrink-0" [class]="step.done ? 'text-success-strong' : step.current ? 'text-info' : 'text-muted'" />
              <div class="min-w-0">
                <p class="font-semibold text-ink">{{ step.title }}</p>
                <p class="text-[14.5px] text-ink-soft">{{ step.text }}</p>
              </div>
            </li>
          }
        </ol>
        <p class="mt-4 text-[14.5px] leading-relaxed text-ink-soft" data-testid="plan-change-renewal">
          @if (c.state === 'REVERTING') {
            Le pedimos a Mercado Pago que vuelva al monto anterior. Hasta que lo confirme, el cambio sigue en curso: te avisamos cuando esté cancelado. Si entretanto se cobra {{ money(c.amount) }}, ese cobro puede activar PRO.
          } @else {
            El importe acordado rige cuando se apruebe el cobro de {{ money(c.amount) }}. Desde ahí, tu suscripción se renueva cada mes a ese
            precio hasta que dejes de renovar. Si el cobro no se aprueba, el nuevo importe no entra en vigencia. Tu acceso a PRO sigue las condiciones vigentes de tu suscripción.
          }
        </p>
        @if (c.state !== 'REVERTING') {
          <button type="button" class="mt-4 min-h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light disabled:opacity-60 press" [disabled]="billing.changingPlan()" [attr.aria-busy]="billing.changingPlan()" (click)="discard()" data-testid="plan-change-discard">Descartar el cambio</button>
        }
      </section>
    } @else if (transferStart(); as start) {
      <section id="cambio-de-plan" class="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-labelledby="plan-change-title" data-testid="plan-change-transfer">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Cambio de plan</p>
        <h2 id="plan-change-title" class="mt-1 font-sans text-[22px] font-bold text-ink">PRO empieza el {{ date(start) }}</h2>
        <p class="mt-1.5 text-[15px] text-ink-soft">Confirmamos tu pago por transferencia. Seguís con PRO hasta ese día y no perdés ningún día ya pagado. No se renueva solo: te avisamos antes de que termine.</p>
      </section>

    }
  `,
})
export class ProPlanChangePanel {
  protected readonly billing = inject(BillingStore);
  private readonly transfer = inject(TransferStore);

  protected readonly pending = this.billing.planChange;
  /** PRO por transferencia ya confirmado que todavía no empezó. */
  protected readonly transferStart = computed(() => (this.pending() ? null : (this.transfer.overview()?.plusStartsAt ?? null)));

  protected money = proPriceAmount;
  protected date = (iso: string) => billingDate(iso);

  /**
   * Los tres momentos, siempre a la vista y sin adelantarse: solicitado, confirmado por Mercado Pago y activo.
   * Mientras hay un cambio pendiente, "activo" todavía no pasó (cuando pasa, el cambio deja de ser pendiente y
   * el plan de la cuenta es PRO).
   */
  protected steps(c: PlanChange): { key: string; title: string; text: string; done: boolean; current: boolean }[] {
    const reverting = c.state === 'REVERTING';
    const confirmed = c.state === 'CONFIRMED';
    const when = c.effectiveAt ? `Próximo cobro previsto: ${this.date(c.effectiveAt)}.` : 'La fecha del cobro la confirma Mercado Pago.';
    return [
      { key: 'requested', title: 'Solicitado', text: 'Guardamos tu pedido. No se cobró nada.', done: true, current: false },
      {
        key: 'confirmed',
        title: 'Confirmado por Mercado Pago',
        text: reverting
          ? 'Estamos pidiendo a Mercado Pago que vuelva al monto anterior. Todavía no está confirmado.'
          : confirmed
            ? `Mercado Pago ya informa el monto nuevo de ${this.money(c.amount)}. ${when}`
            : 'Esperando que Mercado Pago lo confirme. Si no lo hace, el nuevo importe no entra en vigencia y tu acceso a PRO sigue las condiciones vigentes de tu suscripción.',
        done: confirmed,
        current: !confirmed,
      },
      {
        key: 'active',
        title: 'PRO activo',
        text: 'El importe acordado rige cuando el cobro figure aprobado. Hasta entonces conservás tu acceso vigente.',
        done: false,
        current: false,
      },
    ];
  }

  protected async discard(): Promise<void> {
    await this.billing.cancelPlanChange();
  }
}
