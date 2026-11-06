import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { founderAwarePrice } from '../../../core/utils/founder-price';
import { FounderSeats } from '../founder-seats/founder-seats';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { FREE_DIRECT_REQUESTS, PRO_EARLY_ACCESS, proThreeLines } from '../../../core/utils/pro-benefits';

@Component({
  selector: 'app-plan-options',
  imports: [FounderSeats],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Planes de Resuelve" class="grid gap-4 lg:grid-cols-2" data-testid="three-plans">
      <article class="relative flex min-w-0 flex-col rounded-2xl border-2 border-brand bg-brand-tint p-5">
        <p class="mb-3 text-xs font-bold tracking-wider text-brand uppercase">Recomendado</p>
        <h2 class="text-xl font-bold">PRO</h2>
        @if (price(); as value) { <p class="mt-2 text-3xl font-bold tabular-nums">{{ amount(value) }} <span class="text-sm font-normal text-muted">/ mes</span></p> }
        @if (offerLine(); as o) { <p class="mt-1 text-sm font-semibold text-accent-ink" data-testid="plan-card-offer">{{ o }}</p> }
        <app-founder-seats class="mt-4 block" [info]="info()?.founder" [ownFounderPrice]="ownFounderPrice()" />
        <ul class="mt-5 grid gap-2.5 text-[15px] leading-6 text-ink" data-testid="pro-visibility">
          @for (line of lines(); track line) {
            <li class="flex gap-2.5"><span class="mt-0.5 font-bold text-brand" aria-hidden="true">✓</span><span>{{ line }}</span></li>
          }
        </ul>
        <p class="mt-3 text-sm text-ink-soft">Incluye todo lo de Gratis.</p>
        <details class="group mt-3 text-sm text-ink-soft">
          <summary class="min-h-11 cursor-pointer py-2 font-semibold text-brand">Qué más incluye</summary>
          <ul class="mt-1 grid list-disc gap-2 pl-5 leading-6 marker:text-brand" data-testid="pro-tools">
            <li>Portada, antes/después y tus 3 mejores trabajos fijados arriba</li>
            <li>Presupuestos en PDF para mandar por WhatsApp</li>
            <li>Estadísticas completas, Tu mes en CSV y resumen semanal</li>
          </ul>
          <p class="mt-3 leading-relaxed text-muted" data-testid="plan-access-rules">{{ earlyAccess }} {{ directRequests }}</p>
        </details>
        @if (allowPurchase()) { <div class="mt-auto pt-6"><button type="button" class="button-primary min-h-12 w-full rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy()" [attr.aria-busy]="busy()" (click)="choose.emit('PRO')">{{ proLabel() }}</button><p class="mt-2 text-center text-xs text-muted">Sin permanencia: cancelás cuando quieras desde Mi plan.</p></div> }
        @else { <p class="mt-auto pt-5 text-sm font-semibold text-brand">{{ paid() ? 'Incluido en tu cuenta' : 'Se elige desde Mi plan' }}</p> }
      </article>
      <article class="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <p class="mb-3 text-xs font-semibold text-muted">Sin costo</p>
        <h2 class="text-xl font-bold">Gratis</h2><p class="mt-2 text-3xl font-bold">$0</p>
        <p class="mt-2 text-sm text-muted">Para empezar y conseguir tu primer cliente.</p>
        <ul class="mt-5 grid list-disc gap-3 pl-5 text-sm leading-6 text-ink-soft marker:text-muted">
          <li>Perfil, WhatsApp, llamadas y reseñas</li><li>Te llegan pedidos de presupuesto</li>
          <li>@if (info()?.free?.quoteLimit === null) { Respondés todos los pedidos. } @else { Respondés {{ info()?.free?.quoteLimit ?? 'algunos' }} pedidos de presupuesto en total }</li>
          <li>Sin trabajos con fotos</li>
        </ul>
        <p class="mt-auto pt-5 text-sm font-semibold text-muted">{{ paid() ? 'Disponible si termina tu plan pago' : 'Tu punto de partida' }}</p>
      </article>
    </section>
  `,
})
export class PlanOptions {
  readonly info = input<PlansInfo | null>(null);
  /** Precio fundador de quien mira: su precio real si el vigente subió. */
  readonly ownFounderPrice = input<number | null | undefined>(null);
  readonly allowPurchase = input(false);
  readonly paid = input(false);
  readonly allowPlusPurchase = input(false);
  readonly busy = input(false);
  /** El cambio a Plus se puede programar para el próximo período (sin cancelar): cambia el texto de la tarjeta. */
  readonly scheduleHint = input(false);
  /** Oferta de bienvenida vigente para quien mira ("Primer mes $12.000 · 20% OFF"), debajo del precio de PRO. */
  /** Texto del botón de PRO ("Quiero Resuelve PRO", "Volver a PRO": lo decide quien conoce el estado del cobro). */
  readonly proLabel = input('Elegir PRO');
  readonly offerLine = input<string | null>(null);
  /** El backend permite programar Plus por transferencia (y no hay pago en curso): el botón lleva al formulario. */
  readonly scheduleTransfer = input(false);
  readonly scheduleTransferClick = output<void>();
  readonly choose = output<'PRO' | 'PRO_PLUS'>();
  protected readonly price = computed(() => {
    const current = this.info()?.pro.monthlyPriceArs;
    return current ? founderAwarePrice(current, this.ownFounderPrice()) : null;
  });
  protected readonly lines = computed(() => proThreeLines(this.info()?.free?.quoteLimit));
  protected readonly earlyAccess = PRO_EARLY_ACCESS;
  protected readonly directRequests = FREE_DIRECT_REQUESTS;
  protected readonly amount = proPriceAmount;
}
