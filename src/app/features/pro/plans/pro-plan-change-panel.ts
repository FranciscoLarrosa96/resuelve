import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PlanChange, PlanChangeOptions } from '../../../core/models/billing';
import { BillingStore } from '../../../core/state/billing.store';
import { TransferStore } from '../../../core/state/transfer.store';
import { billingDate } from '../../../core/utils/billing-copy';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';

/** Por qué todavía no se puede pedir el cambio (el backend manda el motivo; el texto lo arma esta pantalla). */
const BLOCKED: Record<string, string> = {
  TOO_CLOSE: 'Tu próximo cobro es muy pronto para programar el cambio. Podés pedirlo después de que se cobre.',
  OFFER_PENDING: 'Podés programar el cambio después de tu próximo cobro, cuando tu precio de bienvenida ya pasó al normal.',
};

/**
 * "Pasar a PRO Plus" en el próximo período, sin cancelar y sin perder lo ya pagado (id `cambio-de-plan`,
 * destino de los avisos del cambio). Muestra, con datos del backend:
 *  - Mercado Pago: la confirmación (precio, fecha prevista del cobro, cuándo empieza Plus, qué pasa con la
 *    renovación) y los TRES momentos por separado: solicitado, confirmado por Mercado Pago y activo.
 *    "Activo" es el plan mismo (Plus rige recién cuando el cobro de Plus figura aprobado): esta tarjeta
 *    nunca lo da por hecho antes. La fecha del cobro es una previsión, no una garantía.
 *  - Transferencia: PRO Plus ya confirmado que empieza al terminar el PRO pagado.
 * Sin cambio pendiente ni opción disponible no dibuja nada. Sin prorrateo: no se cobra ni se descuenta nada hoy.
 */
@Component({
  selector: 'app-pro-plan-change-panel',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pending(); as c) {
      <section id="cambio-de-plan" class="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-labelledby="plan-change-title" data-testid="plan-change" [attr.data-state]="c.state">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Cambio de plan</p>
        <h2 id="plan-change-title" class="mt-1 font-sans text-[22px] font-bold text-ink" data-testid="plan-change-title">{{ c.state === 'REVERTING' ? 'Estamos cancelando tu cambio a PRO Plus' : 'Pasás a PRO Plus en tu próximo cobro' }}</h2>
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
            Le pedimos a Mercado Pago que vuelva al monto anterior. Hasta que lo confirme, el cambio sigue en curso: te avisamos cuando esté cancelado. Si entretanto se cobra {{ money(c.amount) }}, ese cobro puede activar PRO Plus.
          } @else {
            Tu plan sigue siendo PRO hasta que se apruebe el cobro de {{ money(c.amount) }}. Desde ahí, tu suscripción se renueva cada mes a ese
            precio hasta que dejes de renovar. Si el cobro no se aprueba, Plus no se activa. Tu acceso a PRO sigue las condiciones vigentes de tu suscripción.
          }
        </p>
        @if (c.state !== 'REVERTING') {
          <button type="button" class="mt-4 min-h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light disabled:opacity-60 press" [disabled]="billing.changingPlan()" [attr.aria-busy]="billing.changingPlan()" (click)="discard()" data-testid="plan-change-discard">Descartar el cambio</button>
        }
      </section>
    } @else if (transferStart(); as start) {
      <section id="cambio-de-plan" class="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-labelledby="plan-change-title" data-testid="plan-change-transfer">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Cambio de plan</p>
        <h2 id="plan-change-title" class="mt-1 font-sans text-[22px] font-bold text-ink">PRO Plus empieza el {{ date(start) }}</h2>
        <p class="mt-1.5 text-[15px] text-ink-soft">Confirmamos tu pago por transferencia. Seguís con PRO hasta ese día y no perdés ningún día ya pagado. No se renueva solo: te avisamos antes de que termine.</p>
      </section>
    } @else if (options(); as o) {
      <section id="cambio-de-plan" class="mt-6 scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-labelledby="plan-change-title" data-testid="plan-change-offer">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Cambio de plan</p>
        <h2 id="plan-change-title" class="mt-1 font-sans text-[22px] font-bold text-ink">Pasá a PRO Plus en tu próximo cobro</h2>
        <p class="mt-1.5 max-w-2xl text-[15px] text-ink-soft">Sin cancelar tu suscripción y sin perder lo que ya pagaste: seguís con PRO hasta ese cobro.</p>
        @if (o.available) {
          <button type="button" class="button-primary mt-4 min-h-12 rounded-xl px-5 text-[15px] font-semibold" (click)="open.set(true)" data-testid="plan-change-open">Programar el cambio</button>
        } @else if (blockedText(o); as why) {
          <p class="mt-3 text-[14.5px] text-muted" data-testid="plan-change-blocked">{{ why }}</p>
        }
      </section>
      <app-dialog [open]="open()" labelledBy="plan-change-dialog-title" describedBy="plan-change-dialog-text" [dismissable]="!billing.changingPlan()" (dismiss)="open.set(false)">
        <h2 id="plan-change-dialog-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Antes de confirmar</h2>
        <div id="plan-change-dialog-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
          <dl class="grid gap-3" data-testid="plan-change-summary">
            <div><dt class="text-[14px] text-muted">Precio</dt><dd class="font-semibold text-ink tabular-nums">{{ money(o.amount) }} por mes</dd></div>
            <div><dt class="text-[14px] text-muted">Próximo cobro previsto</dt><dd class="font-semibold text-ink">{{ o.nextPaymentAt ? date(o.nextPaymentAt) : 'A confirmar con Mercado Pago' }}</dd></div>
            <div><dt class="text-[14px] text-muted">Cuándo empieza PRO Plus</dt><dd class="text-ink">Cuando ese cobro figure aprobado. Hasta entonces seguís con PRO.</dd></div>
            <div><dt class="text-[14px] text-muted">Tu renovación</dt><dd class="text-ink">Desde ese cobro se renueva cada mes a {{ money(o.amount) }}, hasta que dejes de renovar.</dd></div>
          </dl>
          <p class="mt-3">Hoy no se cobra nada ni se descuenta nada del período que ya pagaste. Si el cobro no se aprueba, Plus no se activa. Tu acceso a PRO sigue las condiciones vigentes de tu suscripción. Podés descartar el cambio antes de ese cobro.</p>
          <p class="mt-2 text-[14px] text-muted">La fecha del cobro la define Mercado Pago: es una previsión.</p>
        </div>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="billing.changingPlan()" (click)="open.set(false)">Volver</button>
          <button type="button" class="button-primary flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold disabled:opacity-70" [disabled]="billing.changingPlan()" [attr.aria-busy]="billing.changingPlan()" (click)="confirm()" data-testid="plan-change-confirm">
            @if (billing.changingPlan()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
            Confirmar el cambio
          </button>
        </div>
      </app-dialog>
    }
  `,
})
export class ProPlanChangePanel {
  protected readonly billing = inject(BillingStore);
  private readonly transfer = inject(TransferStore);
  protected readonly open = signal(false);

  protected readonly pending = this.billing.planChange;
  /** Se ofrece (o se explica por qué todavía no) solo si el backend trae la opción: función apagada = nada. */
  protected readonly options = computed(() => (this.billing.planChange() ? null : this.billing.planChangeOptions()));
  /** PRO Plus por transferencia ya confirmado que todavía no empezó. */
  protected readonly transferStart = computed(() => (this.pending() ? null : (this.transfer.overview()?.plusStartsAt ?? null)));

  protected money = proPriceAmount;
  protected date = (iso: string) => billingDate(iso);

  protected blockedText(o: PlanChangeOptions): string | null {
    return o.reason ? (BLOCKED[o.reason] ?? null) : null;
  }

  /**
   * Los tres momentos, siempre a la vista y sin adelantarse: solicitado, confirmado por Mercado Pago y activo.
   * Mientras hay un cambio pendiente, "activo" todavía no pasó (cuando pasa, el cambio deja de ser pendiente y
   * el plan de la cuenta es PRO Plus).
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
            : 'Esperando que Mercado Pago lo confirme. Si no lo hace, Plus no se activa y tu acceso a PRO sigue las condiciones vigentes de tu suscripción.',
        done: confirmed,
        current: !confirmed,
      },
      {
        key: 'active',
        title: 'PRO Plus activo',
        text: 'Rige cuando el cobro de PRO Plus figure aprobado. Hasta entonces seguís con PRO.',
        done: false,
        current: false,
      },
    ];
  }

  protected async confirm(): Promise<void> {
    if (await this.billing.requestPlanChange()) this.open.set(false);
  }

  protected async discard(): Promise<void> {
    await this.billing.cancelPlanChange();
  }
}
