import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BillingStore } from '../../../core/state/billing.store';
import { billingDate, subscriptionPrice } from '../../../core/utils/billing-copy';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * "Tu plan actual" con suscripción de Mercado Pago: estado real del backend
 * (PENDING / ACTIVE / PAST_DUE / PAUSED / CANCELLED), próximo cobro, precio y
 * cancelación sin vueltas. Nunca llama "moroso" a nadie ni simula estados.
 */
@Component({
  selector: 'app-pro-subscription-panel',
  imports: [Dialog, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sub(); as s) {
      <section class="mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6" aria-label="Tu suscripción a Resuelve PRO" data-testid="subscription-panel" [attr.data-status]="s.status">
        <p class="text-[13px] font-semibold tracking-[0.1em] text-muted uppercase">Tu plan actual</p>
        @switch (s.status) {
          @case ('PENDING') {
            <h2 id="sub-title" class="mt-1 font-display text-[22px] font-bold text-ink">Estamos esperando la confirmación de Mercado Pago.</h2>
            <p class="mt-1.5 text-[15px] text-ink-soft">Tu plan sigue en Free hasta que Mercado Pago confirme la suscripción. Si no terminaste, podés seguir donde lo dejaste.</p>
            @if (s.checkoutUrl) {
              <a [href]="s.checkoutUrl" class="mt-4 inline-flex h-12 items-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary-hover press">Continuar en Mercado Pago</a>
            }
          }
          @case ('ACTIVE') {
            <h2 id="sub-title" class="mt-1 flex items-center gap-2 font-display text-[22px] font-bold text-brand-dark"><app-icon name="check-circle" [size]="20" [stroke]="2" />Resuelve PRO</h2>
            <dl class="mt-3 grid gap-3 text-[15px] sm:grid-cols-3">
              <div><dt class="text-[13px] text-muted">Estado</dt><dd class="font-semibold text-ink">Activa</dd></div>
              @if (next(); as n) { <div><dt class="text-[13px] text-muted">Próximo cobro</dt><dd class="font-semibold text-ink">{{ n }}</dd></div> }
              <div><dt class="text-[13px] text-muted">Precio</dt><dd class="font-semibold text-ink tabular-nums">{{ price() }}</dd></div>
            </dl>
            <p class="mt-3 text-[14px] text-muted">El cobro y el medio de pago los administra Mercado Pago.</p>
            <button type="button" class="mt-4 h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light press" (click)="confirmOpen.set(true)">Cancelar suscripción</button>
          }
          @case ('PAST_DUE') {
            <h2 id="sub-title" class="mt-1 font-display text-[22px] font-bold text-ink">Hay un problema con el último cobro.</h2>
            @if (graceUntil(); as g) {
              <p class="mt-1.5 text-[15px] text-ink-soft">Mercado Pago está reintentando el cobro. Mientras tanto mantenemos tu acceso PRO hasta el {{ g }}.</p>
            } @else {
              <p class="mt-1.5 text-[15px] text-ink-soft">Mercado Pago está reintentando el cobro. Tu acceso PRO vuelve apenas se apruebe; tus datos siguen intactos.</p>
            }
            <p class="mt-2 text-[14px] text-muted">Si querés cambiar la tarjeta, hacelo desde tu cuenta de Mercado Pago.</p>
            <button type="button" class="mt-4 h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light press" (click)="confirmOpen.set(true)">Cancelar suscripción</button>
          }
          @case ('PAUSED') {
            <h2 id="sub-title" class="mt-1 font-display text-[22px] font-bold text-ink">Tu suscripción está pausada en Mercado Pago.</h2>
            <p class="mt-1.5 text-[15px] text-ink-soft">Mientras está pausada tenés Free. No se borró nada: al volver a PRO recuperás todo.</p>
          }
          @case ('CANCELLED') {
            <h2 id="sub-title" class="mt-1 font-display text-[22px] font-bold text-ink">Tu suscripción está cancelada.</h2>
            @if (accessUntil(); as a) {
              <p class="mt-1.5 text-[15px] text-ink-soft">No vamos a volver a cobrarte. Seguís teniendo PRO hasta el <span class="font-semibold text-ink">{{ a }}</span>.</p>
            } @else {
              <p class="mt-1.5 text-[15px] text-ink-soft">Tu plan actual es Free. Tu perfil, reseñas y datos siguen como estaban.</p>
            }
          }
        }
      </section>

      <app-dialog [open]="confirmOpen()" labelledBy="cancel-title" describedBy="cancel-text" [dismissable]="!billing.cancelling()" (dismiss)="confirmOpen.set(false)">
        <h2 id="cancel-title" class="font-display text-[23px] font-bold tracking-[-0.02em]">Cancelar Resuelve PRO</h2>
        <div id="cancel-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
          <p>No volveremos a cobrarte.</p>
          <p class="mt-2">Tu perfil, reseñas y datos no se eliminan.</p>
          @if (s.status === 'ACTIVE' && next(); as n) { <p class="mt-2">Si el mes ya está pago, seguís con PRO hasta el {{ n }}.</p> }
        </div>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="billing.cancelling()" (click)="confirmOpen.set(false)">Volver</button>
          <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press" [disabled]="billing.cancelling()" [attr.aria-busy]="billing.cancelling()" (click)="cancel()">
            @if (billing.cancelling()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
            Cancelar suscripción
          </button>
        </div>
      </app-dialog>
    }
  `,
})
export class ProSubscriptionPanel {
  protected readonly billing = inject(BillingStore);
  protected readonly confirmOpen = signal(false);

  /** Solo con algo que mostrar: una cancelada sin acceso ya no ocupa lugar. */
  protected readonly sub = computed(() => {
    const s = this.billing.subscription();
    if (!s) return null;
    if (s.status === 'CANCELLED' && !(s.accessUntil && new Date(s.accessUntil) > new Date())) return null;
    return s;
  });
  protected readonly next = computed(() => {
    const iso = this.sub()?.nextPaymentAt;
    return iso ? billingDate(iso) : null;
  });
  protected readonly price = computed(() => {
    const s = this.sub();
    return s ? subscriptionPrice(s) : '';
  });
  protected readonly graceUntil = computed(() => {
    const iso = this.sub()?.graceUntil;
    return iso && new Date(iso) > new Date() ? billingDate(iso) : null;
  });
  protected readonly accessUntil = computed(() => {
    const iso = this.sub()?.accessUntil;
    return iso ? billingDate(iso, true) : null;
  });

  protected async cancel(): Promise<void> {
    if (await this.billing.cancelSubscription()) this.confirmOpen.set(false);
  }
}
