import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BillingStore } from '../../../core/state/billing.store';
import { billingDate, subscriptionPrice } from '../../../core/utils/billing-copy';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';

/** Días que se sigue mostrando "Revocaste tu contratación" una vez devuelto el dinero. */
const WITHDRAWN_NOTICE_DAYS = 30;

/**
 * "Tu plan actual" con suscripción de Mercado Pago: estado real del backend
 * (PENDING / ACTIVE / PAST_DUE / PAUSED / CANCELLED), próximo cobro, precio y
 * cancelación sin vueltas. Cancelar = cancelar la renovación: una cancelada
 * con `accessUntil` futuro sigue mostrando "Resuelve PRO" (Estado: Cancelada)
 * hasta esa fecha. Nunca llama "moroso" a nadie ni simula estados.
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
            <h2 id="sub-title" class="mt-1 font-sans text-[22px] font-bold text-ink">Estamos esperando la confirmación de Mercado Pago.</h2>
            <p class="mt-1.5 text-[15px] text-ink-soft">Tu plan sigue en Free hasta que Mercado Pago confirme la suscripción. Si no terminaste, podés seguir donde lo dejaste.</p>
            @if (s.checkoutUrl) {
              <a [href]="s.checkoutUrl" class="button-primary mt-4 inline-flex h-12 items-center rounded-xl px-5 text-[15px] font-semibold">Continuar en Mercado Pago</a>
            }
          }
          @case ('ACTIVE') {
            <h2 id="sub-title" class="mt-1 flex items-center gap-2 font-sans text-[22px] font-bold text-brand-dark"><app-icon name="check-circle" [size]="20" [stroke]="2" />Resuelve PRO</h2>
            <dl class="mt-3 grid gap-3 text-[15px] sm:grid-cols-3">
              <div><dt class="text-[14px] text-muted">Estado</dt><dd class="font-semibold text-ink">Activa</dd></div>
              @if (next(); as n) { <div><dt class="text-[14px] text-muted">Próximo cobro</dt><dd class="font-semibold text-ink">{{ n }}</dd></div> }
              <div><dt class="text-[14px] text-muted">Precio</dt><dd class="font-semibold text-ink tabular-nums">{{ price() }}</dd></div>
            </dl>
            <p class="mt-3 text-[14px] text-muted">El cobro y el medio de pago los administra Mercado Pago.</p>
            <button type="button" class="mt-4 h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light press" (click)="confirmOpen.set(true)">Cancelar suscripción</button>
          }
          @case ('PAST_DUE') {
            <h2 id="sub-title" class="mt-1 font-sans text-[22px] font-bold text-ink">Hay un problema con el último cobro.</h2>
            @if (graceUntil(); as g) {
              <p class="mt-1.5 text-[15px] text-ink-soft">Mercado Pago está reintentando el cobro. Mientras tanto mantenemos tu acceso PRO hasta el {{ g }}.</p>
            } @else {
              <p class="mt-1.5 text-[15px] text-ink-soft">Mercado Pago está reintentando el cobro. Tu acceso PRO vuelve apenas se apruebe; tus datos siguen intactos.</p>
            }
            <p class="mt-2 text-[14px] text-muted">Si querés cambiar la tarjeta, hacelo desde tu cuenta de Mercado Pago.</p>
            <button type="button" class="mt-4 h-11 rounded-xl border border-line-btn px-4 text-[14.5px] font-semibold text-ink hover:bg-sand-light press" (click)="confirmOpen.set(true)">Cancelar suscripción</button>
          }
          @case ('PAUSED') {
            <h2 id="sub-title" class="mt-1 font-sans text-[22px] font-bold text-ink">Tu suscripción está pausada en Mercado Pago.</h2>
            <p class="mt-1.5 text-[15px] text-ink-soft">Mientras está pausada tenés Free. No se borró nada: al volver a PRO recuperás todo.</p>
          }
          @case ('CANCELLED') {
            @if (s.withdrawnAt) {
              <!-- Arrepentimiento ejercido: PRO se quitó en el acto; el reembolso puede estar en curso. -->
              <h2 id="sub-title" class="mt-1 font-sans text-[22px] font-bold text-ink" data-testid="withdrawn-title">Revocaste tu contratación de Resuelve PRO.</h2>
              <p class="mt-1.5 text-[15px] text-ink-soft">Tu plan volvió a Free y no se van a hacer más cobros. Tu perfil, reseñas y datos siguen intactos.</p>
              @if (s.refundPending) {
                <p class="mt-2 text-[15px] font-semibold text-ink" data-testid="refund-pending">Estamos procesando la devolución{{ refund() ? ' de ' + refund() : '' }}. Si no la ves acreditada en unos días, te lo vamos a reintentar solos.</p>
              } @else if (refund()) {
                <p class="mt-2 text-[15px] font-semibold text-ink" data-testid="refund-done">Te devolvimos {{ refund() }} por el mismo medio de pago. Mercado Pago puede demorar unos días en acreditarlo.</p>
              }
            } @else {
              <!-- Cancelar = cancelar la renovación: lo pagado sigue siendo PRO hasta accessUntil. -->
              <h2 id="sub-title" class="mt-1 flex items-center gap-2 font-sans text-[22px] font-bold text-brand-dark"><app-icon name="check-circle" [size]="20" [stroke]="2" />Resuelve PRO</h2>
              <dl class="mt-3 grid gap-3 text-[15px] sm:grid-cols-3">
                <div><dt class="text-[14px] text-muted">Estado</dt><dd class="font-semibold text-ink" data-testid="subscription-state">Cancelada</dd></div>
                @if (accessUntil(); as a) { <div><dt class="text-[14px] text-muted">Acceso PRO hasta</dt><dd class="font-semibold text-ink" data-testid="access-until">{{ a }}</dd></div> }
              </dl>
              <p class="mt-3 text-[15px] text-ink-soft">Tu suscripción está cancelada. Seguís teniendo Resuelve PRO hasta el <span class="font-semibold text-ink">{{ accessUntil() }}</span>. No se realizarán nuevos cobros.</p>
              <p class="mt-1.5 text-[14px] text-muted">Tu suscripción no se renovará. Después de esa fecha pasás a Free sin perder tu perfil, reseñas ni datos.</p>
            }
          }
        }
        @if (withdrawUntil(); as until) {
          <!-- Arrepentimiento (Ley 24.240, art. 34): visible mientras corre el plazo, sin vueltas. -->
          <div class="mt-5 border-t border-line pt-4" data-testid="withdraw-section">
            <p class="text-[14px] text-ink-soft">¿Te arrepentiste? Podés revocar la contratación hasta el {{ until }} y te devolvemos lo que pagaste.</p>
            <button type="button" class="mt-2 min-h-11 rounded-lg text-[14.5px] font-semibold text-danger hover:underline" (click)="withdrawOpen.set(true)">Botón de arrepentimiento</button>
          </div>
        }
      </section>

      <app-dialog [open]="withdrawOpen()" labelledBy="withdraw-title" describedBy="withdraw-text" [dismissable]="!billing.withdrawing()" (dismiss)="withdrawOpen.set(false)">
        <h2 id="withdraw-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Revocar la contratación de PRO</h2>
        <div id="withdraw-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
          <p>Ejercés tu derecho de arrepentimiento, sin costo y sin tener que explicar el motivo. Al confirmar:</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <li>Cancelamos la suscripción: no se vuelve a cobrar.</li>
            @if (refund(); as r) {
              <li data-testid="withdraw-refund">Te devolvemos {{ r }} por el mismo medio de pago. Mercado Pago puede demorar unos días en acreditarlo.</li>
            } @else {
              <li>Todavía no hay un cobro registrado. Si Mercado Pago llega a cobrar, te lo devolvemos.</li>
            }
            <li>Resuelve PRO se quita ahora mismo: volvés a Free.</li>
          </ul>
          <p class="mt-3">Tu perfil, reseñas y datos no se eliminan.</p>
        </div>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand disabled:opacity-55" [disabled]="billing.withdrawing()" (click)="withdrawOpen.set(false)">Volver</button>
          <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-xl bg-danger-fill px-5 text-[15px] font-semibold text-white disabled:opacity-70 press" [disabled]="billing.withdrawing()" [attr.aria-busy]="billing.withdrawing()" (click)="withdraw()">
            @if (billing.withdrawing()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
            Revocar contratación
          </button>
        </div>
      </app-dialog>

      <app-dialog [open]="confirmOpen()" labelledBy="cancel-title" describedBy="cancel-text" [dismissable]="!billing.cancelling()" (dismiss)="confirmOpen.set(false)">
        <h2 id="cancel-title" class="font-sans text-[23px] font-bold tracking-[-0.02em]">Cancelar Resuelve PRO</h2>
        <div id="cancel-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
          <p>No volveremos a cobrarte.</p>
          @if (s.status === 'ACTIVE') {
            <p class="mt-2">Vas a mantener los beneficios PRO hasta el fin del período que ya pagaste.</p>
            @if (next(); as n) {
              <p class="mt-3 text-[14px] text-muted">Acceso hasta</p>
              <p class="font-semibold text-ink" data-testid="cancel-access-until">{{ n }}</p>
            }
          } @else if (s.status === 'PAST_DUE') {
            <p class="mt-2">Como el último cobro no se aprobó, al cancelar tu plan pasa a Free.</p>
          }
          <p class="mt-3">Tu perfil, reseñas y datos no se eliminan.</p>
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
  protected readonly withdrawOpen = signal(false);

  /** Solo con algo que mostrar: una cancelada sin acceso ya no ocupa lugar. */
  protected readonly sub = computed(() => {
    const s = this.billing.subscription();
    if (!s) return null;
    // Revocó la contratación: se muestra el resultado (y el reembolso en curso) por un tiempo.
    if (s.withdrawnAt) return this.withdrawnVisible(s.withdrawnAt, s.refundPending) ? s : null;
    // Cancelada: solo mientras dura el PRO ya pagado (después, Free y la página de venta).
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

  /** Arrepentimiento: solo mientras corre la ventana (el backend manda `null` si ya no corresponde). */
  protected readonly withdrawUntil = computed(() => {
    const iso = this.sub()?.withdrawableUntil;
    return iso && new Date(iso) > new Date() ? billingDate(iso) : null;
  });
  protected readonly refund = computed(() => {
    const amount = this.sub()?.refundAmount ?? 0;
    return amount > 0 ? proPriceAmount(amount) : null;
  });

  private withdrawnVisible(withdrawnAt: string, pending: boolean): boolean {
    return pending || Date.now() - new Date(withdrawnAt).getTime() < WITHDRAWN_NOTICE_DAYS * 86_400_000;
  }

  protected async withdraw(): Promise<void> {
    if (await this.billing.withdraw()) this.withdrawOpen.set(false);
  }

  protected async cancel(): Promise<void> {
    if (await this.billing.cancelSubscription()) this.confirmOpen.set(false);
  }
}
