import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { WorkPhotosStore, FREE_WORK_LIMIT } from '../../../core/state/work-photos.store';
import { monthName } from '../../../core/utils/month-analytics';
import { priceMultipleText, proGainFacts, proObservedGroups, proZeroDiagnosis } from '../../../core/utils/pro-value';
import { ProStore } from '../../../core/state/pro.store';
import { Icon } from '../../../shared/components/icon/icon';

/**
 * "Tu mes con Resuelve PRO": lo que pasó en el perfil del que paga, con sus números reales y
 * separado por lo que significa cada uno (interés → presupuestos y trabajos por Resuelve), más
 * lo registrado de su plan (Destacados, acceso anticipado, trabajos publicados) y lo aceptado
 * contra el precio. Nunca dice que PRO lo causó. Con poca actividad, acciones sobre su perfil real.
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
      <p class="text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase">Tu mes con Resuelve {{ planName() }}</p>
      <h2 id="pro-value-title" class="mt-1 font-sans text-[21px] font-bold tracking-[-0.01em] text-ink">
        Lo que pasó en tu perfil en {{ month() }}
      </h2>
      @for (g of groups(); track g.key) {
        <div class="mt-4" [attr.data-testid]="'pro-value-' + g.key">
          <h3 class="text-[15px] font-semibold text-ink">{{ g.title }}</h3>
          <ul class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            @for (f of g.facts; track f.text) {
              <li class="border-l-2 border-brand pl-3" data-testid="pro-value-fact">
                <b class="block text-[26px] leading-8 font-bold text-ink tabular-nums">{{ f.value }}</b>
                <span class="text-[14px] leading-5 text-ink-soft">{{ f.text }}</span>
              </li>
            }
          </ul>
          <p class="mt-2 text-[13px] leading-5 text-muted" data-testid="pro-value-note">{{ g.note }}</p>
        </div>
      }
      @if (facts().length || works()) {
        <div class="mt-5" data-testid="pro-value-plan">
          <h3 class="text-[15px] font-semibold text-ink">Lo que registramos de tu plan</h3>
          <ul class="mt-2 grid gap-3 sm:grid-cols-3">
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
        </div>
      }
      @if (!groups().length && !facts().length && !works()) {
        <p class="mt-3 text-[15px] leading-6 text-ink-soft" data-testid="pro-value-empty">
          Todavía no hay actividad registrada en tu perfil este mes.
        </p>
      }
      @if (lowActivity() && diagnosis().length) {
        <div class="mt-5 border-t border-brand-line pt-4" data-testid="pro-value-actions">
          <h3 class="text-[15px] font-semibold text-ink">Qué podés revisar en tu perfil</h3>
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
        </div>
      }
      @if (multiple(); as m) {
        <p class="mt-4 text-[15px] leading-6 font-semibold text-ink" data-testid="pro-value-multiple">{{ m }}</p>
        <p class="text-[13px] text-muted">Es la suma de lo acordado en Resuelve, no necesariamente lo que cobraste.</p>
      }
      <p class="mt-4 text-[13px] leading-5 text-muted" data-testid="pro-value-disclaimer">
        Son hechos registrados en tu perfil este mes. No decimos que Resuelve {{ planName() }} los causó ni que se vayan a repetir.
      </p>
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
  protected readonly groups = computed(() => proObservedGroups(this.data()));
  protected readonly planName = computed(() => (this.data().plan === 'PRO_PLUS' ? 'PRO Plus' : 'PRO'));
  /** Casi sin interés este mes (ninguna aparición ni visita): ahí tienen sentido las acciones sobre el perfil. */
  protected readonly lowActivity = computed(() => {
    const e = this.data().exposure;
    return !e || e.impressions + e.profileViews === 0;
  });
  protected readonly multiple = computed(() => priceMultipleText(this.data()));
  private readonly pro = inject(ProStore);
  /** Sin nada que contar: por qué, con su arreglo (nunca un cero suelto). */
  protected readonly diagnosis = computed(() => proZeroDiagnosis(this.data(), this.pro.ownProfile()));
  /** Solo si ya publicó más de lo que permite Free: es lo que PRO le deja mostrar. */
  protected readonly works = computed(() => {
    if (!this.photos.loaded()) return null;
    const count = this.photos.activeWorks().length;
    return count > FREE_WORK_LIMIT ? { count, max: this.data().entitlements.portfolioWorkLimit, free: FREE_WORK_LIMIT } : null;
  });

  constructor() {
    if (!this.photos.loaded()) void this.photos.load();
  }
}
