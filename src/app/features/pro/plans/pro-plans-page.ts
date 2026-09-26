import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProAnalyticsApiService } from '../../../core/api/pro-analytics-api.service';
import { PlansInfo } from '../../../core/models/pro-analytics';
import { ProStore } from '../../../core/state/pro.store';
import { formatARS } from '../../../core/utils/format';

interface CompareRow {
  label: string;
  free: boolean | string;
  pro: boolean | string;
}

/**
 * Resuelve Free vs. PRO. Solo lo que existe de verdad: el precio y el
 * límite Free vienen del backend (GET /plans, configurables), el plan
 * actual de /pro/me. Nada de pruebas gratis, precios fijos ni features
 * futuras mostradas como disponibles. No se contrata desde la app todavía.
 */
@Component({
  selector: 'app-pro-plans-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-plans-page.html',
})
export class ProPlansPage {
  protected readonly store = inject(ProStore);
  private readonly api = inject(ProAnalyticsApiService);

  protected readonly info = signal<PlansInfo | null>(null);

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
  protected readonly price = computed(() => {
    const ars = this.info()?.pro.monthlyPriceArs;
    return ars ? `${formatARS(ars)} por mes` : null;
  });
  protected readonly freeQuotes = computed(() => {
    const limit = this.info()?.free.monthlyQuoteLimit;
    return limit ? `Hasta ${limit} presupuestos por mes` : 'Enviar presupuestos';
  });
  /** Tercer beneficio solo si la herramienta existe (flag real del backend). */
  protected readonly templatesReady = computed(() => !!this.info()?.pro.features.quoteTemplates);

  protected readonly rows = computed<CompareRow[]>(() => [
    { label: 'Perfil profesional', free: true, pro: true },
    { label: 'Aparecer en resultados', free: true, pro: true },
    { label: 'Recibir solicitudes', free: true, pro: true },
    { label: 'Presupuestos', free: this.info()?.free.monthlyQuoteLimit ? `${this.info()!.free.monthlyQuoteLimit} por mes` : true, pro: true },
    { label: 'Agenda', free: true, pro: true },
    { label: 'Reseñas', free: true, pro: true },
    { label: 'Tu mes', free: 'Básico', pro: 'Completo' },
    { label: 'Perfil destacado (badge PRO)', free: false, pro: true },
    { label: 'Espacios destacados en resultados', free: false, pro: true },
    { label: 'Análisis por servicio, barrio y semana', free: false, pro: true },
  ]);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Si falla, la página sigue siendo correcta: el precio queda "a confirmar".
      this.api.getPlans().subscribe({ next: (info) => this.info.set(info), error: () => undefined });
    }
  }
}
