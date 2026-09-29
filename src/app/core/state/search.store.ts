import { Injectable, computed, inject, signal } from '@angular/core';
import { Service } from '../models/category';
import { ProfessionalSummary } from '../models/professional';
import { RequestFlowMode } from '../models/service-request';
import { RequestAttributionSource } from '../models/request';
import { CatalogStore } from './catalog.store';
import { ComparisonStore } from './comparison.store';
import { EMPTY_LIST_FILTERS, ProfessionalsStore } from './professionals.store';
import { RequestStore } from './request.store';

export { MAX_COMPARE } from './comparison.store';
export type { CompareRow } from './comparison.store';

/**
 * Cómo se llegó a /profesionales:
 *  - 'explore': "quiero ver profesionales" (Home, menú, servicios). Listado
 *    limpio, filtrado solo por lo que viene en la URL. Nunca usa un pedido.
 *  - 'request': desde "Crear solicitud" con un pedido real armado por el
 *    cliente (/profesionales?pedido=1). Muestra y usa ese pedido.
 */
export type SearchMode = 'explore' | 'request';

/**
 * Estado de la pantalla de resultados: modo y filtros del listado real. La
 * selección para comparar es de `ComparisonStore` (única fuente; acá solo se
 * reexpone para las pantallas de resultados).
 */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly request = inject(RequestStore);
  private readonly pros = inject(ProfessionalsStore);
  private readonly catalog = inject(CatalogStore);

  private readonly comparison = inject(ComparisonStore);

  /** Cómo se entró a resultados (ver SearchMode). null = todavía no se entró. */
  readonly mode = signal<SearchMode | null>(null);

  /** Profesionales elegidos para comparar/pedir (ComparisonStore). */
  readonly selected = this.comparison.selected;
  readonly selectedIds = this.comparison.selectedIds;
  readonly compareOpen = this.comparison.open;
  readonly canCompare = this.comparison.canCompare;
  readonly compareRows = this.comparison.rows;
  /** Solo servicios con requiresLicense (Gas, Electricidad) ofrecen el filtro de matrícula. */
  readonly licenseApplicable = computed(() => this.pros.selectedService()?.requiresLicense ?? false);

  /**
   * Al entrar a resultados: pide al backend los profesionales del servicio
   * del pedido (por id real). Si el catálogo todavía no cargó, lo vuelve a
   * intentar la pantalla cuando llegue.
   */
  enterRequest(): void {
    const service = this.request.service();
    if (!service) return;
    const wasRequest = this.mode() === 'request';
    this.mode.set('request');
    // La comparación NO se vacía al cambiar de modo o de filtro: es de la persona, no de la búsqueda.
    if (!wasRequest || this.pros.filters().serviceId !== service.id) {
      this.pros.setFilters({ ...EMPTY_LIST_FILTERS, serviceId: service.id });
    } else {
      this.pros.load();
    }
  }

  /**
   * Navegación exploratoria: sin pedido. Al llegar desde otro lado arranca
   * limpio (solo el servicio de la URL); al volver de un perfil conserva los
   * filtros que eligió la persona.
   */
  explore(serviceId: string | null): void {
    const wasExplore = this.mode() === 'explore';
    this.mode.set('explore');
    if (!wasExplore) {
      this.pros.setFilters({ ...EMPTY_LIST_FILTERS, serviceId });
    } else if (this.pros.filters().serviceId !== serviceId) {
      this.pros.setFilters({ serviceId, licenseVerified: false });
    } else {
      this.pros.load();
    }
  }

  /** Cambiar el servicio del pedido real (solo en modo 'request'). */
  changeService(service: Service): void {
    this.request.setService(service);
    this.pros.setFilters({ serviceId: service.id, licenseVerified: false });
  }

  /**
   * Deja listo el pedido para "Solicitar presupuesto". Se CONSERVA el pedido
   * actual (con sus ediciones: fecha, descripción, barrio…) cuando todos los
   * elegidos ofrecen su servicio y además (a) se llegó con ese pedido
   * (modo 'request', incluido "Cambiar profesional") o (b) el pedido ya estaba
   * dirigido a estos mismos profesionales (volver al perfil de Ariel y tocar
   * "Solicitar presupuesto" otra vez NO es empezar de cero). Si no, se arma
   * uno NUEVO con un servicio que todos ofrecen (el filtrado, si hay).
   */
  prepareRequest(
    pros: ProfessionalSummary[],
    intent: RequestFlowMode,
    source: RequestAttributionSource = intent === 'TARGETED' ? 'ORGANIC_SEARCH' : 'MARKETPLACE_DISCOVERY',
  ): void {
    const current = this.request.service();
    const offersAll = (id: string | null | undefined) =>
      !!id && pros.every((p) => p.services.some((s) => s.id === id));
    const sameTarget = this.request.isTargetedTo(pros.map((p) => p.id));
    const keep =
      this.request.hasContext() && offersAll(current?.id) && (this.mode() === 'request' || sameTarget);
    if (!keep) {
      this.request.resetForNewRequest();
      const candidates = [this.pros.filters().serviceId, ...(pros[0]?.services.map((s) => s.id) ?? [])];
      const id = candidates.find((c) => offersAll(c)) ?? pros[0]?.services[0]?.id;
      const service = this.catalog.activeServices().find((s) => s.id === id);
      if (service) this.request.setService(service);
    }
    this.request.askProfessionals(pros, intent, source);
  }

  resetForNewRequest(): void {
    this.clearSelection();
  }

  selectionNumber(id: string): number {
    return this.comparison.position(id);
  }

  toggleSelected(pro: ProfessionalSummary): void {
    this.comparison.toggle(pro);
  }

  clearSelection(): void {
    this.comparison.clear();
  }

  openCompare(): void {
    this.comparison.openCompare();
  }

  closeCompare(): void {
    this.comparison.close();
  }
}
