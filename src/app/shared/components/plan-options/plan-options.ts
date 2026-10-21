import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { PHOTOS_PER_WORK, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { proPriceAmount } from '../../../core/utils/quote-usage';
import { FREE_DIRECT_REQUESTS, PRO_EARLY_ACCESS, PRO_RESPONSE_BENEFIT } from '../../../core/utils/pro-benefits';

@Component({
  selector: 'app-plan-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Planes de Resuelve" class="grid gap-4 lg:grid-cols-2" data-testid="three-plans">
      <article class="relative flex min-w-0 flex-col rounded-2xl border-2 border-brand bg-brand-tint p-5">
        <p class="mb-3 text-xs font-bold tracking-wider text-brand uppercase">Recomendado</p>
        <h2 class="text-xl font-bold">PRO</h2>
        @if (info(); as p) { <p class="mt-2 text-3xl font-bold tabular-nums">{{ amount(p.pro.monthlyPriceArs) }} <span class="text-sm font-normal text-muted">/ mes</span></p> }
        @if (offerLine(); as o) { <p class="mt-1 text-sm font-semibold text-accent-ink" data-testid="plan-card-offer">{{ o }}</p> }
        <p class="mt-2 text-sm text-muted">Para darle más visibilidad a tu oficio.</p>
        <ul class="mt-5 grid list-disc gap-3 pl-5 text-sm leading-6 text-ink-soft marker:text-brand">
          <li>Todo lo de Gratis</li><li>Participación en espacios Destacados</li><li>Fotos de trabajos en resultados y portada</li><li>{{ responseBenefit }}</li><li>Hasta {{ proWorks }} trabajos, con {{ photos }} fotos cada uno</li><li>Estadísticas completas y resumen semanal</li><li>Trabajos fijados y comparaciones de antes y después</li><li>Presupuestos en PDF y Tu mes en CSV</li>
        </ul>
        @if (allowPurchase()) { <div class="mt-auto pt-6"><button type="button" class="button-primary min-h-12 w-full rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy()" [attr.aria-busy]="busy()" (click)="choose.emit('PRO')">{{ proLabel() }}</button></div> }
        @else { <p class="mt-auto pt-5 text-sm font-semibold text-brand">{{ paid() ? 'Incluido en tu cuenta' : 'Se elige desde Mi plan' }}</p> }
      </article>
      <article class="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <p class="mb-3 text-xs font-semibold text-muted">Sin costo</p>
        <h2 class="text-xl font-bold">Gratis</h2><p class="mt-2 text-3xl font-bold">$0</p>
        <p class="mt-2 text-sm text-muted">Para empezar y conseguir tu primer cliente.</p>
        <ul class="mt-5 grid list-disc gap-3 pl-5 text-sm leading-6 text-ink-soft marker:text-muted">
          <li>Perfil, WhatsApp, llamadas y reseñas</li><li>Agenda y solicitudes por Resuelve</li><li>Sin publicación de trabajos con fotos</li>
          <li>@if (info()?.free?.quoteLimit === null) { Respondés oportunidades nuevas sin límite. } @else { Tenés {{ info()?.free?.quoteLimit ?? 'el cupo vigente de' }} oportunidades de búsqueda en total, desde el primer presupuesto. }</li>
        </ul>
        <p class="mt-auto pt-5 text-sm font-semibold text-muted">{{ paid() ? 'Disponible si termina tu plan pago' : 'Tu punto de partida' }}</p>
      </article>
    </section>
    <p class="mt-3 text-sm leading-relaxed text-muted" data-testid="plan-access-rules">{{ earlyAccess }} {{ directRequests }}</p>
  `,
})
export class PlanOptions {
  readonly info = input<PlansInfo | null>(null);
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
  protected readonly responseBenefit = PRO_RESPONSE_BENEFIT;
  protected readonly earlyAccess = PRO_EARLY_ACCESS;
  protected readonly directRequests = FREE_DIRECT_REQUESTS;
  protected readonly amount = proPriceAmount;
  protected readonly proWorks = PRO_WORK_LIMIT;
  protected readonly photos = PHOTOS_PER_WORK;
}
