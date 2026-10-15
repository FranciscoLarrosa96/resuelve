import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { proPriceAmount } from '../../../core/utils/quote-usage';

@Component({
  selector: 'app-plan-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-label="Planes de Resuelve" class="grid gap-4 lg:grid-cols-3" data-testid="three-plans">
      <article class="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <h2 class="text-xl font-bold">Gratis</h2><p class="mt-2 text-3xl font-bold">$0</p>
        <p class="mt-2 text-sm text-muted">Para empezar y conseguir tu primer cliente.</p>
        <ul class="mt-5 grid gap-2 text-sm text-ink-soft">
          <li>Perfil, WhatsApp, llamadas y reseñas</li><li>Agenda y solicitudes por Resuelve</li><li>1 trabajo con hasta 5 fotos</li>
          <li>@if (info()?.free?.quoteLimit === null) { Respondés oportunidades nuevas sin límite. } @else { Respondés sin límite hasta tu primer cliente. Después, {{ info()?.free?.quoteLimit ?? 'el cupo vigente de' }} oportunidades nuevas en total. }</li>
        </ul>
        <p class="mt-auto pt-5 text-sm font-semibold text-muted">{{ paid() ? 'Disponible si termina tu plan pago' : 'Tu punto de partida' }}</p>
      </article>
      <article class="relative flex min-w-0 flex-col rounded-2xl border-2 border-brand bg-surface p-5">
        <p class="mb-2 text-xs font-bold tracking-wider text-brand uppercase">Recomendado</p>
        <h2 class="text-xl font-bold">PRO</h2>
        @if (info(); as p) { <p class="mt-2 text-3xl font-bold tabular-nums">{{ amount(p.pro.monthlyPriceArs) }} <span class="text-sm font-normal text-muted">/ mes</span></p> }
        <p class="mt-2 text-sm text-muted">Para darle más visibilidad a tu oficio.</p>
        <ul class="mt-5 grid gap-2 text-sm text-ink-soft">
          <li>Todo lo de Gratis</li><li>Participación en espacios Destacados</li><li>Fotos de trabajos en resultados y portada</li><li>Solicitudes nuevas antes que Free y presupuestos sin límite</li><li>Hasta 10 trabajos, con 5 fotos cada uno</li><li>Estadísticas completas y resumen semanal</li>
        </ul>
        @if (allowPurchase()) { <button type="button" class="button-primary mt-auto min-h-12 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy()" (click)="choose.emit('PRO')">Elegir PRO</button> }
        @else { <p class="mt-auto pt-5 text-sm font-semibold text-brand">{{ paid() ? 'Incluido en tu cuenta' : 'Se elige desde Mi plan' }}</p> }
      </article>
      <article class="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5">
        <h2 class="text-xl font-bold">PRO Plus</h2>
        @if (info()?.proPlus; as p) { <p class="mt-2 text-3xl font-bold tabular-nums">{{ amount(p.monthlyPriceArs) }} <span class="text-sm font-normal text-muted">/ mes</span></p> }
        <p class="mt-2 text-sm text-muted">Para presentar más trabajos y llevar tus números con vos.</p>
        <ul class="mt-5 grid gap-2 text-sm text-ink-soft">
          <li>Todo lo de PRO</li><li>Hasta 30 trabajos, con 5 fotos cada uno</li><li>Hasta 3 trabajos fijados al principio de tu perfil</li><li>Comparaciones de antes y después</li><li>Presupuestos en PDF para descargar y compartir</li><li>Exportación de Tu mes en CSV</li>
        </ul>
        @if (allowPlusPurchase() && info()?.proPlus) { <button type="button" class="button-secondary mt-auto min-h-12 rounded-xl px-4 font-semibold disabled:opacity-50" [disabled]="busy()" (click)="choose.emit('PRO_PLUS')">Elegir PRO Plus</button> }
        @else { <p class="mt-auto pt-5 text-sm text-muted">{{ paid() ? 'Podés cambiar cuando termine tu período pago.' : 'Se elige desde Mi plan' }}</p> }
      </article>
    </section>
    <p class="mt-3 text-sm leading-relaxed text-muted">PRO y PRO Plus participan en Destacados con las mismas reglas. La prueba gratis corresponde a PRO. Los planes pagos no garantizan clientes ni ingresos.</p>
  `,
})
export class PlanOptions {
  readonly info = input<PlansInfo | null>(null);
  readonly allowPurchase = input(false);
  readonly paid = input(false);
  readonly allowPlusPurchase = input(false);
  readonly busy = input(false);
  readonly choose = output<'PRO' | 'PRO_PLUS'>();
  protected readonly amount = proPriceAmount;
}
