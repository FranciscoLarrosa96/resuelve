import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EligibleIntroOffer, ProIntroOffer } from '../../../core/models/pro-profile';
import { BillingStore } from '../../../core/state/billing.store';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { LIMIT_MODAL_COPY, WANT_PRO_LINK, offerPriceLine, offerTitle, proPriceAmount } from '../../../core/utils/quote-usage';
import { Dialog } from '../dialog/dialog';

/** Lo público de la solicitud que no se puede responder (nunca contacto ni dirección). */
export interface LimitContext {
  title: string;
  zone: string | null;
}

/**
 * Intento de responder una solicitud nueva con el cupo FREE agotado (el
 * backend respondió o respondería FREE_QUOTE_LIMIT_REACHED). Es el momento
 * de la oferta: hay una oportunidad concreta que Free no deja responder.
 * Sin timers ni urgencia inventada; "Seguir con Free" siempre visible.
 * Bottom sheet en mobile (lo resuelve `app-dialog`, con foco atrapado,
 * Escape y foco de vuelta).
 */
@Component({
  selector: 'app-quote-limit-dialog',
  imports: [Dialog, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-dialog [open]="open()" labelledBy="quote-limit-title" describedBy="quote-limit-text" (dismiss)="dismiss.emit()">
      <h2 id="quote-limit-title" class="font-display text-[23px] font-bold tracking-[-0.02em]">{{ copy.title }}</h2>
      <div id="quote-limit-text" class="mt-3 text-[15px] leading-[1.5] text-ink-soft">
        <p>{{ copy.used(limit()) }} {{ copy.still }}</p>
        <p class="mt-2 font-medium text-ink">{{ copy.pro }}</p>
        <p class="mt-1">{{ copy.extra }}</p>
      </div>
      @if (context(); as c) {
        <div class="mt-4 border-l-2 border-brand-line pl-3" data-testid="limit-context">
          <p class="text-[12.5px] font-semibold tracking-[0.08em] text-muted uppercase">{{ copy.context }}</p>
          <p class="mt-0.5 text-[15px] font-semibold text-ink">{{ c.title }}</p>
          @if (c.zone) { <p class="text-[14px] text-ink-soft">{{ c.zone }}</p> }
        </div>
      }
      @if (eligible(); as o) {
        <div class="mt-4 rounded-xl border border-brand bg-brand-tint px-4 py-3" data-testid="pro-offer">
          <p class="flex flex-wrap items-center gap-2 text-[15.5px] font-bold text-brand-dark">
            <span class="rounded-md bg-accent-soft px-1.5 py-px text-[12px] font-bold tracking-[0.06em] text-accent-ink uppercase">Oferta</span>{{ title(o) }}
          </p>
          <p class="mt-1 text-[14px] text-ink-soft">
            Resuelve PRO: <span class="font-semibold text-ink tabular-nums">{{ prices(o).first }}</span>. {{ prices(o).then }}.
          </p>
        </div>
      } @else if (price(); as p) {
        <div class="mt-4 flex items-baseline justify-between gap-3 rounded-xl border border-brand bg-brand-tint px-4 py-3">
          <p class="text-[14px] font-semibold text-brand-dark">Resuelve PRO</p>
          <p><span class="text-[20px] font-bold text-ink tabular-nums">{{ p }}</span><span class="text-[14px] text-muted"> / mes</span></p>
        </div>
      }
      <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="h-12 rounded-xl px-4 text-[15px] font-semibold text-ink-soft hover:bg-sand" (click)="dismiss.emit()">
          {{ copy.stay }}
        </button>
        @if (selfServe()) {
          <button type="button" class="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60 press" [disabled]="billing.starting()" [attr.aria-busy]="billing.starting()" (click)="checkout()">
            @if (billing.starting()) { <span class="size-4 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" aria-hidden="true"></span> }
            {{ checkoutLabel() }}
          </button>
        } @else {
          <a [routerLink]="want.path" [queryParams]="want.query" class="flex h-12 items-center justify-center rounded-xl bg-brand px-5 text-[15px] font-semibold text-white hover:bg-brand-dark press" (click)="go()">
            {{ eligible() ? copy.ctaOffer : copy.cta }}
          </a>
        }
      </div>
    </app-dialog>
  `,
})
export class QuoteLimitDialog {
  private readonly plans = inject(PlansStore);
  private readonly pro = inject(ProStore);
  protected readonly billing = inject(BillingStore);
  private readonly router = inject(Router);

  readonly open = input.required<boolean>();
  /** Cupo mensual FREE (del uso real del backend). */
  readonly limit = input.required<number>();
  /** Oferta que vino con el rechazo del backend; null = la de /pro/me. */
  readonly offer = input<ProIntroOffer | null>(null);
  /** Solicitud que intentó responder (solo título y barrio). */
  readonly context = input<LimitContext | null>(null);
  readonly dismiss = output<void>();

  protected readonly copy = LIMIT_MODAL_COPY;
  protected readonly want = WANT_PRO_LINK;
  protected readonly title = offerTitle;
  protected readonly prices = offerPriceLine;
  protected readonly eligible = computed<EligibleIntroOffer | null>(() => {
    const o = this.offer() ?? this.pro.introOffer();
    return o?.eligible ? o : null;
  });
  protected readonly price = computed(() => {
    const ars = this.plans.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(ars) : null;
  });

  constructor() {
    this.plans.load();
    effect(() => {
      const offer = this.eligible();
      if (this.open() && offer) untracked(() => this.pro.trackOffer('SHOWN', 'LIMIT_MODAL', offer));
    });
  }

  /** true = se contrata online (Mercado Pago): el botón va directo al checkout. */
  protected readonly selfServe = computed(() => !!this.plans.info()?.pro.selfServe);
  protected readonly checkoutLabel = computed(() => {
    const o = this.eligible();
    return o ? `Aprovechar ${o.discountPercent}% OFF` : 'Pasarme a PRO';
  });

  /**
   * Checkout desde el intento 11: vuelve a ESTA solicitud después de activar
   * (ruta interna; el backend la revalida). Nunca se activa nada acá.
   */
  protected checkout(): void {
    const offer = this.eligible();
    if (offer) this.pro.trackOffer('CLICKED', 'LIMIT_MODAL', offer);
    void this.billing.createCheckout(this.router.url.split(/[?#]/)[0]);
  }

  protected go(): void {
    const offer = this.eligible();
    if (offer) this.pro.trackOffer('CLICKED', 'LIMIT_MODAL', offer);
    this.dismiss.emit();
  }
}
