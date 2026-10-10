import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuoteUsage } from '../../../core/models/pro-analytics';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { FREE_LIMIT_COPY, offerTitle, proPriceAmount, quoteUsageNotice } from '../../../core/utils/quote-usage';
import { Icon } from '../icon/icon';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';

/** Con más cupo que esto, una línea continua en vez de un segmento por presupuesto. */
const MAX_SEGMENTS = 20;

/**
 * Límite de Free alcanzado: qué pasa (sigue recibiendo solicitudes), qué
 * resuelve PRO, cuánto cuesta y, si el backend dice que es elegible, la
 * oferta de bienvenida con el precio normal siempre visible.
 * "Seguir con Free" siempre visible: nada de esconder la opción gratis.
 */
@Component({
  selector: 'app-free-limit-notice',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block rounded-2xl border border-brand bg-brand-tint px-4.5 py-4 sm:px-5', 'data-testid': 'free-limit' },
  template: `
    <div class="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div class="min-w-0 flex-1 basis-72">
        <p class="text-[16px] font-bold text-ink">{{ copy.title(limit()) }}</p>
        <p class="mt-1 text-[14px] leading-[1.45] text-ink-soft">{{ copy.body }}</p>
        <p class="mt-1 text-[14px] leading-[1.45] font-medium text-ink">{{ copy.pro }}</p>
        @if (offer(); as o) {
          <p class="mt-2.5 inline-flex items-center gap-2 rounded-lg border border-accent-line bg-surface px-2.5 py-1 text-[14px] font-semibold text-accent-ink" data-testid="pro-offer">
            <span class="rounded-md bg-accent-soft px-1.5 py-px text-[12px] font-bold tracking-[0.06em] uppercase">Oferta</span>Tenés {{ title(o) }}.
          </p>
        }
      </div>
      @if (price(); as p) {
        <p class="shrink-0 text-right" data-testid="pro-price">
          <span class="block text-[12px] font-semibold tracking-[0.1em] text-brand uppercase">Resuelve PRO</span>
          <span class="text-[22px] leading-tight font-bold text-ink tabular-nums">{{ p }}</span><span class="text-[14px] text-muted"> / mes</span>
          @if (offer()) { <span class="block text-[14px] text-muted">después del primer mes</span> }
        </p>
      }
    </div>
    <div class="mt-3.5 flex flex-wrap items-center gap-2">
      <a routerLink="/pro/plan" class="button-primary flex h-11 items-center rounded-xl px-4.5 text-[14.5px] font-semibold" (click)="clicked()">{{ copy.cta }}</a>
      @if (dismissible()) {
        <button type="button" class="h-11 rounded-xl px-3.5 text-[14.5px] font-semibold text-ink-soft hover:bg-surface" (click)="stay.emit()">{{ copy.stay }}</button>
      }
    </div>
  `,
})
export class FreeLimitNotice {
  private readonly plans = inject(PlansStore);
  private readonly funnel = inject(FunnelTracker);
  private readonly pro = inject(ProStore);
  /** Cupo total Free (del uso real del backend). */
  readonly limit = input.required<number>();
  readonly dismissible = input(true);
  readonly stay = output<void>();

  protected readonly copy = FREE_LIMIT_COPY;
  protected readonly title = offerTitle;
  /** Solo si el backend dice que HOY es elegible. */
  protected readonly offer = this.pro.introOffer;
  /** Solo el precio real de /plans; si no llegó, no se muestra ninguno. */
  protected readonly price = computed(() => {
    const ars = this.plans.info()?.pro.monthlyPriceArs;
    return ars ? proPriceAmount(ars) : null;
  });

  constructor() {
    this.plans.load();
    effect(() => {
      if (this.offer()) untracked(() => this.pro.trackOffer('SHOWN', 'REQUESTS_USAGE'));
    });
  }

  protected clicked(): void {
    this.funnel.track('PRO_CTA_CLICKED', 'REQUESTS_USAGE');
    if (this.offer()) this.pro.trackOffer('CLICKED', 'REQUESTS_USAGE');
  }
}

/**
 * Contador del cupo Free ("Oportunidades Free · 2 de 5 usadas").
 * Un segmento por oportunidad; el tono cambia con lo que queda: sin PRO
 * hasta que quedan 3, un enlace discreto en 7–8, un aviso claro con 1 (con
 * la oferta si es elegible) y el bloque del límite al agotarse. PRO: "sin límite",
 * sin contador ni oferta.
 */
@Component({
  selector: 'app-quote-usage-meter',
  imports: [RouterLink, Icon, FreeLimitNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'quote-usage' },
  template: `
    @if (notice(); as n) {
      @if (n.counter) {
        @if (n.tone === 'limit' && !limitDismissed()) {
          <div class="mb-3 flex items-baseline justify-between gap-3 text-[14px]">
            <span class="text-muted">Oportunidades Free</span><span class="font-semibold text-ink tabular-nums">{{ n.counter }} usadas</span>
          </div>
          <app-free-limit-notice [limit]="n.limit!" (stay)="dismissLimit.emit()" />
        } @else {
          <div class="rounded-2xl px-4 py-3.5" [class]="n.tone === 'last' ? 'border border-accent-line bg-accent-soft' : n.tone === 'limit' ? 'border border-brand-line bg-surface' : 'border border-line bg-surface'">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p class="flex min-w-0 items-baseline gap-2 text-[14px]">
                <span class="font-medium text-muted">Oportunidades Free</span>{{ ' ' }}
                <span class="font-bold text-ink tabular-nums">{{ n.counter }} usadas</span>
              </p>{{ ' ' }}
              <span class="flex min-w-32 flex-1 items-center gap-0.75" aria-hidden="true">
                @if (segments(); as segs) {
                  @for (s of segs; track $index) {
                    <span class="h-1.5 min-w-0 flex-1 rounded-full" [class]="s ? fill() : 'bg-track'"></span>
                  }
                } @else {
                  <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-track"><span class="block h-full rounded-full" [class]="fill()" [style.width.%]="pct()"></span></span>
                }
              </span>
            </div>
            @if (n.used === 0) {
              <p class="mt-1.5 text-[14px] text-muted">Tenés {{ n.limit }} oportunidades incluidas para responder pedidos.</p>
            }
            @if (n.tone === 'last') {
              <p class="mt-2.5 text-[15px] font-bold text-accent-ink">{{ n.remaining }}</p>
              <p class="mt-0.5 text-[14px] leading-[1.45] text-ink-soft">{{ n.detail }}</p>
              @if (offer(); as o) {
                <p class="mt-2 text-[14.5px] font-semibold text-ink" data-testid="pro-offer">
                  <span class="mr-1.5 rounded-md bg-accent-soft px-1.5 py-px text-[12px] font-bold tracking-[0.06em] text-accent-ink uppercase">Oferta</span>{{ title(o) }} de PRO
                </p>
              }
              <a routerLink="/pro/plan" class="button-primary mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold" (click)="clicked()">{{ n.cta }}</a>
            } @else if (n.tone === 'limit') {
              <p class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
                <span class="font-semibold text-ink">{{ limitTitle(n.limit!) }}</span>
                <a routerLink="/pro/plan" class="font-semibold text-brand hover:underline">Ver Resuelve PRO</a>
              </p>
            } @else {
              <p class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
                <span [class]="n.tone === 'warn' ? 'font-semibold text-accent-ink' : 'text-muted'">{{ n.remaining }}</span>
                @if (n.cta) {
                  <a routerLink="/pro/plan" class="inline-flex items-center gap-1 font-semibold text-brand hover:underline">{{ n.cta }}<app-icon name="arrow-right" [size]="13" [stroke]="2.4" /></a>
                }
              </p>
            }
          </div>
        }
      } @else if (unlimited()) {
        <div class="flex items-start gap-3 rounded-2xl border border-brand-line bg-brand-tint px-4 py-3.5" data-testid="pro-usage-copy">
          <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-brand" aria-hidden="true"><app-icon name="infinity" [size]="18" [stroke]="1.9" /></span>
          <div class="min-w-0">
            @if (trialActive()) {
              <p class="text-[14px] font-semibold text-brand-dark"><span class="font-bold">Prueba PRO</span> · Respondé sin límite hasta conseguir tu primer cliente.</p>
              <p class="mt-0.5 text-[14px] leading-[1.4] text-ink-soft">La prueba no muestra un badge PRO público.</p>
            } @else {
              <p class="text-[14px] font-semibold text-brand-dark">PRO activo · respuestas sin límite.</p>
              <p class="mt-0.5 text-[14px] leading-[1.4] text-ink-soft">Seguís teniendo respuestas sin límite y acceso anticipado a nuevas oportunidades.</p>
            }
          </div>
        </div>
      }
    }
  `,
})
export class QuoteUsageMeter {
  private readonly pro = inject(ProStore);
  private readonly funnel = inject(FunnelTracker);
  readonly usage = input.required<QuoteUsage>();
  /** Entitlement real (`canSendUnlimitedQuotes`); el contador ya viene sin límite para PRO. */
  readonly unlimited = input(false);
  protected readonly trialActive = computed(() => !!this.pro.plan()?.trialActive);
  /** "Seguir con Free" se eligió para esta sesión: no vuelve a abrir el aviso. */
  readonly limitDismissed = input(false);
  readonly dismissLimit = output<void>();

  protected readonly notice = computed(() => quoteUsageNotice(this.usage()));
  protected readonly title = offerTitle;
  protected readonly limitTitle = FREE_LIMIT_COPY.title;
  /** Oferta de bienvenida: solo con 1 restante (en el límite la muestra el bloque del límite). */
  protected readonly offer = computed(() => (this.notice().tone === 'last' ? this.pro.introOffer() : null));

  constructor() {
    effect(() => {
      if (this.offer()) untracked(() => this.pro.trackOffer('SHOWN', 'REQUESTS_USAGE'));
    });
    // Aviso de la última oportunidad Free: solo con el contador real del backend en 1 restante.
    effect(() => {
      if (this.notice().tone === 'last') untracked(() => this.funnel.track('PRO_PLAN_VIEWED', 'LAST_FREE_OPPORTUNITY'));
    });
  }

  protected clicked(): void {
    this.funnel.track('PRO_CTA_CLICKED', this.notice().tone === 'last' ? 'LAST_FREE_OPPORTUNITY' : 'REQUESTS_USAGE');
    if (this.offer()) this.pro.trackOffer('CLICKED', 'REQUESTS_USAGE');
  }
  protected readonly segments = computed(() => {
    const { used, limit } = this.notice();
    return limit !== null && limit <= MAX_SEGMENTS ? Array.from({ length: limit }, (_, i) => i < used) : null;
  });
  protected readonly pct = computed(() => {
    const { used, limit } = this.notice();
    return limit ? Math.min(100, (used / limit) * 100) : 0;
  });
  protected readonly fill = computed(() => {
    const tone = this.notice().tone;
    return tone === 'warn' || tone === 'last' ? 'bg-accent' : 'bg-brand';
  });
}
