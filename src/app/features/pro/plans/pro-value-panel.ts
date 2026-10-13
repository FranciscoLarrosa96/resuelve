import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { WorkPhotosStore, FREE_WORK_LIMIT, PRO_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { monthName } from '../../../core/utils/month-analytics';
import { priceMultipleText, proGainFacts, proZeroDiagnosis } from '../../../core/utils/pro-value';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * "Tu Resuelve PRO este mes": lo que el que paga recibió, con sus números reales
 * (Destacados, acceso anticipado, solicitudes desde Destacados, trabajos publicados
 * por encima de Free y lo aceptado contra el precio). Nunca dice que PRO lo causó.
 */
@Component({
  selector: 'app-pro-value-panel',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-2xl border border-brand-line bg-brand-tint px-5 py-5 md:px-6"
      aria-labelledby="pro-value-title"
      data-testid="pro-value"
    >
      <p class="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">Tu Resuelve PRO</p>
      <h2 id="pro-value-title" class="mt-1 font-sans text-[21px] font-bold tracking-[-0.01em] text-ink">
        Lo que sumó PRO en {{ month() }}
      </h2>
      @if (!facts().length && !works()) {
        <div class="mt-3" data-testid="pro-value-empty">
          @if (diagnosis().length) {
            <p class="text-[15px] leading-6 font-semibold text-ink">Por qué todavía no hay números este mes</p>
            <ul class="mt-2 grid gap-2">
              @for (z of diagnosis(); track z.text) {
                <li class="text-[14.5px] leading-6 text-ink-soft" data-testid="pro-value-diagnosis">
                  {{ z.text }}
                  @if (z.cta; as c) {
                    <a [routerLink]="c.link" class="font-semibold text-brand hover:underline">{{ c.label }}</a>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="text-[15px] leading-6 text-ink-soft">
              Todavía no apareciste en Destacados este mes: los espacios rotan día a día entre los PRO
              que cumplen el servicio y la zona que se busca.
            </p>
          }
        </div>
      } @else {
        <ul class="mt-4 grid gap-3 sm:grid-cols-3">
          @for (f of facts(); track f.text) {
            <li class="border-l-2 border-brand pl-3" data-testid="pro-value-fact">
              <b class="block text-[26px] leading-8 font-bold text-ink tabular-nums">{{ f.value }}</b>
              <span class="text-[14px] leading-5 text-ink-soft">{{ f.text }}</span>
            </li>
          }
          @if (works(); as w) {
            <li class="border-l-2 border-brand pl-3" data-testid="pro-value-works">
              <b class="block text-[26px] leading-8 font-bold text-ink tabular-nums">{{ w.count }} de {{ w.max }}</b>
              <span class="text-[14px] leading-5 text-ink-soft"
                >trabajos publicados; en Free se {{ w.free === 1 ? 've 1' : 'ven ' + w.free }}</span
              >
            </li>
          }
        </ul>
      }
      @if (multiple(); as m) {
        <p class="mt-4 text-[15px] leading-6 font-semibold text-ink" data-testid="pro-value-multiple">{{ m }}</p>
        <p class="text-[13px] text-muted">Es la suma de lo acordado en Resuelve, no necesariamente lo que cobraste.</p>
      }
      <a
        routerLink="/pro/estadisticas"
        class="mt-3 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-brand hover:underline"
        >Ver Tu mes completo <app-icon name="arrow-right" [size]="13" [stroke]="2.4"
      /></a>
    </section>
  `,
})
export class ProValuePanel {
  readonly data = input.required<MonthAnalytics>();
  private readonly photos = inject(WorkPhotosStore);

  protected readonly month = computed(() => monthName(this.data().period));
  protected readonly facts = computed(() => proGainFacts(this.data()));
  protected readonly multiple = computed(() => priceMultipleText(this.data()));
  private readonly pro = inject(ProStore);
  /** Sin nada que contar: por qué, con su arreglo (nunca un cero suelto). */
  protected readonly diagnosis = computed(() => proZeroDiagnosis(this.data(), this.pro.ownProfile()));
  /** Solo si ya publicó más de lo que permite Free: es lo que PRO le deja mostrar. */
  protected readonly works = computed(() => {
    if (!this.photos.loaded()) return null;
    const count = this.photos.activeWorks().length;
    return count > FREE_WORK_LIMIT ? { count, max: PRO_WORK_LIMIT, free: FREE_WORK_LIMIT } : null;
  });

  constructor() {
    if (!this.photos.loaded()) void this.photos.load();
  }
}
