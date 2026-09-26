import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlansStore } from '../../../core/state/plans.store';
import { ProStore } from '../../../core/state/pro.store';
import { proPriceText, quoteUsageNotice } from '../../../core/utils/quote-usage';

interface CompareRow {
  label: string;
  free: boolean | string;
  pro: boolean | string;
}

/**
 * Resuelve Free vs. PRO. Precio y cupo FREE vienen del backend (GET /plans,
 * configurables); el plan y el uso del mes, de /pro/me. Solo lo que existe:
 * sin prueba gratis, sin features futuras como disponibles y sin contratación
 * online todavía (PRO se habilita de forma gradual).
 */
@Component({
  selector: 'app-pro-plans-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
})
export class ProPlansPage {
  protected readonly store = inject(ProStore);
  private readonly plans = inject(PlansStore);

  protected readonly info = this.plans.info;

  /** null mientras se carga /pro/me: no se afirma ningún plan. */
  protected readonly isPro = computed(() => {
    const plan = this.store.plan();
    return plan ? plan.tier === 'PRO' : null;
  });
  protected readonly proUntil = computed(() => {
    const iso = this.store.plan()?.expiresAt;
    return iso
      ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso))
      : null;
  });
  /** "$19.000 / mes" (null hasta que responde /plans: nunca un precio escrito a mano). */
  protected readonly price = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? proPriceText(ars) : null;
  });
  protected readonly freeLimit = computed(() => this.info()?.free.monthlyQuoteLimit ?? null);
  protected readonly freeQuotes = computed(() => {
    const limit = this.freeLimit();
    return limit ? `${limit} presupuestos por mes` : 'Presupuestos sin límite';
  });
  /** Uso real del mes para quien está en Free ("7 de 10"). */
  protected readonly usage = computed(() => {
    const u = this.store.ownProfile()?.quoteUsage;
    return u && this.isPro() === false ? quoteUsageNotice(u).counter : null;
  });
  /** Tercer beneficio solo si la herramienta existe (flag real del backend). */
  protected readonly templatesReady = computed(() => !!this.info()?.pro.features.quoteTemplates);

  protected readonly freeItems = computed(() => [
    'Perfil profesional',
    'Solicitudes sin límite',
    this.freeQuotes(),
    'Agenda',
    'Reseñas',
    'Tu mes básico',
  ]);
  protected readonly proItems = [
    'Todo lo de Free',
    'Presupuestos sin límite',
    'Perfil PRO destacado',
    'Espacios destacados',
    'Métricas de exposición',
    'Embudo de oportunidades',
    'Tu mes completo',
  ];

  protected readonly rows = computed<CompareRow[]>(() => {
    const limit = this.freeLimit();
    return [
      { label: 'Perfil profesional', free: true, pro: true },
      { label: 'Aparecer en resultados', free: true, pro: true },
      { label: 'Recibir solicitudes', free: 'Sin límite', pro: 'Sin límite' },
      { label: 'Presupuestar', free: limit ? `${limit} / mes` : 'Sin límite', pro: 'Sin límite' },
      { label: 'Agenda', free: true, pro: true },
      { label: 'Reseñas', free: true, pro: true },
      { label: 'Tu mes', free: 'Básico', pro: 'Completo' },
      { label: 'Perfil destacado', free: false, pro: true },
      { label: 'Espacios destacados', free: false, pro: true },
      { label: 'Métricas de exposición', free: false, pro: true },
      { label: 'Embudo de rendimiento', free: false, pro: true },
      { label: 'Análisis por servicio y barrio', free: false, pro: true },
    ];
  });

  constructor() {
    this.plans.load();
  }
}
