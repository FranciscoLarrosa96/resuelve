import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BillingStatus } from '../../../core/models/billing';
import { BillingStore } from '../../../core/state/billing.store';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

/** Cada cuánto y hasta cuándo se consulta el estado al volver de Mercado Pago. */
export const RESULT_POLL = { intervalMs: 2500, maxMs: 30_000 } as const;

type Phase = 'checking' | 'active' | 'payment-problem' | 'waiting' | 'none' | 'error';

/**
 * Vuelta de Mercado Pago (`MP_BACK_URL`). Volver NO es pagar: se consulta el
 * backend (que reconcilia con Mercado Pago) cada 2,5 s por hasta 30 s. Solo
 * con la suscripción ACTIVA confirmada se dice "Ya sos Resuelve PRO". Sin
 * polling infinito ni confetti.
 */
@Component({
  selector: 'app-pro-plan-result-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-xl animate-fade-in px-5 pb-16 pt-10 lg:mx-0 lg:px-0 lg:pt-4" aria-live="polite">
      @switch (phase()) {
        @case ('checking') {
          <section class="rounded-2xl border border-line bg-white p-6 md:p-8" data-testid="result-checking">
            <span class="block size-8 animate-spin rounded-full border-[3px] border-brand-line border-t-brand" aria-hidden="true"></span>
            <h1 class="mt-5 font-display text-[28px] leading-tight font-bold text-ink">Estamos confirmando tu suscripción</h1>
            <p class="mt-2 text-[15.5px] text-ink-soft">Mercado Pago nos avisa en unos segundos. No hace falta que hagas nada.</p>
          </section>
        }
        @case ('active') {
          <section class="rounded-2xl border-2 border-brand bg-white p-6 md:p-8" data-testid="result-active">
            <p class="flex items-center gap-2 text-[14px] font-semibold text-brand"><app-icon name="check-circle" [size]="18" [stroke]="2" />Suscripción confirmada</p>
            <h1 class="mt-3 font-display text-[30px] leading-tight font-bold text-ink">Ya sos Resuelve PRO</h1>
            <p class="mt-2 text-[15.5px] text-ink-soft">Presupuestá sin límite, accedé a tu análisis completo y podés aparecer en espacios destacados.</p>
            <div class="mt-6 flex flex-col gap-2.5 sm:flex-row">
              @if (returnPath(); as r) {
                <a [routerLink]="r" class="flex h-12 items-center justify-center rounded-xl bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-dark press">Seguir con esta oportunidad</a>
                <a routerLink="/pro/dashboard" class="flex h-12 items-center justify-center rounded-xl border border-line-btn px-5 text-[15px] font-semibold text-ink hover:bg-sand-light press">Ir a mi panel</a>
              } @else {
                <a routerLink="/pro/dashboard" class="flex h-12 items-center justify-center rounded-xl bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-dark press">Ir a mi panel</a>
              }
            </div>
          </section>
        }
        @case ('payment-problem') {
          <section class="rounded-2xl border border-line bg-white p-6 md:p-8" data-testid="result-problem">
            <h1 class="font-display text-[28px] leading-tight font-bold text-ink">Hay un problema con el cobro</h1>
            <p class="mt-2 text-[15.5px] text-ink-soft">Mercado Pago no pudo cobrar y va a volver a intentarlo. Mientras tanto mantenemos tu acceso PRO. Si querés, revisá tu medio de pago en Mercado Pago.</p>
            <a routerLink="/pro/plan" class="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-dark press">Ver mi plan</a>
          </section>
        }
        @case ('none') {
          <section class="rounded-2xl border border-line bg-white p-6 md:p-8" data-testid="result-none">
            <h1 class="font-display text-[28px] leading-tight font-bold text-ink">No encontramos una suscripción en curso</h1>
            <p class="mt-2 text-[15.5px] text-ink-soft">Si cerraste Mercado Pago antes de terminar, podés volver a intentarlo desde tu plan. No se te cobró nada.</p>
            <a routerLink="/pro/plan" class="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-dark press">Volver al plan</a>
          </section>
        }
        @default {
          <section class="rounded-2xl border border-line bg-white p-6 md:p-8" data-testid="result-waiting">
            <h1 class="font-display text-[28px] leading-tight font-bold text-ink">Todavía estamos esperando confirmación de Mercado Pago.</h1>
            <p class="mt-2 text-[15.5px] text-ink-soft">
              @if (phase() === 'error') { No pudimos consultar el estado. Revisá tu conexión. }
              @else { Puede tardar un poco más. Si ya autorizaste, se activa sola aunque cierres esta página. }
            </p>
            <div class="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button type="button" class="h-12 rounded-xl bg-brand px-6 text-[15px] font-semibold text-white hover:bg-brand-dark press" (click)="retry()">Reintentar</button>
              <a routerLink="/pro/plan" class="flex h-12 items-center justify-center rounded-xl border border-line-btn px-5 text-[15px] font-semibold text-ink hover:bg-sand-light press">Volver al plan</a>
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class ProPlanResultPage {
  private readonly billing = inject(BillingStore);
  private readonly pro = inject(ProStore);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;

  protected readonly phase = signal<Phase>('checking');
  protected readonly returnPath = computed(() => {
    const path = this.billing.subscription()?.returnPath;
    return path && /^\/pro(\/[A-Za-z0-9_-]+){0,4}$/.test(path) ? path : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    this.retry();
  }

  protected retry(): void {
    this.stop();
    this.phase.set('checking');
    this.deadline = Date.now() + RESULT_POLL.maxMs;
    void this.check();
  }

  private async check(): Promise<void> {
    const status = await this.billing.refreshStatus();
    const next = this.phaseOf(status);
    if (next) {
      this.phase.set(next);
      if (next === 'active') this.pro.refreshProfile();
      return;
    }
    if (Date.now() + RESULT_POLL.intervalMs > this.deadline) {
      this.phase.set(status ? 'waiting' : 'error');
      return;
    }
    this.timer = setTimeout(() => void this.check(), RESULT_POLL.intervalMs);
  }

  /** Estado final para mostrar, o null = seguir esperando. */
  private phaseOf(s: BillingStatus | null): Phase | null {
    if (!s) return null;
    const sub = s.subscription;
    if (sub?.status === 'ACTIVE' && s.plan === 'PRO') return 'active';
    if (sub?.status === 'PAST_DUE') return 'payment-problem';
    if (!sub || sub.status === 'CANCELLED' || sub.status === 'PAUSED') return s.plan === 'PRO' ? 'active' : 'none';
    return null;
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
