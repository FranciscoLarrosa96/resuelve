import { Injectable, computed, inject, signal } from '@angular/core';
import { Service } from '../models/category';
import { ProfessionalSummary, coverageText, hasLicenseFor } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { oneDecimal } from '../utils/format';
import { CatalogStore } from './catalog.store';
import { EMPTY_LIST_FILTERS, ProfessionalsStore } from './professionals.store';
import { RequestStore } from './request.store';

export interface CompareRow {
  label: string;
  cells: { value: string; best: boolean }[];
}

export const MAX_COMPARE = 3;

type Def = {
  label: string;
  text: (p: ProfessionalSummary) => string;
  /** Valor numérico para marcar "Mejor". null = no comparable (p. ej. sin reseñas). */
  value?: (p: ProfessionalSummary) => number | null;
};

/** Solo datos reales del contrato público. Nada de distancia, precios ni tiempos de respuesta. */
const COMPARE_DEFS: Def[] = [
  {
    label: 'Valoración',
    text: (p) => (p.averageRating === null ? 'Sin reseñas todavía' : '★ ' + oneDecimal(p.averageRating)),
    value: (p) => p.averageRating,
  },
  { label: 'Reseñas', text: (p) => String(p.reviewsCount), value: (p) => (p.reviewsCount ? p.reviewsCount : null) },
  {
    label: 'Trabajos por Resuelve',
    text: (p) => String(p.completedJobsCount),
    value: (p) => (p.completedJobsCount ? p.completedJobsCount : null),
  },
  { label: 'Experiencia', text: (p) => `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'}` },
  { label: 'Disponibilidad', text: (p) => (p.availableToday ? 'Disponible hoy' : 'No disponible hoy') },
  { label: 'Zonas', text: (p) => coverageText(p) || '—' },
  { label: 'Servicios', text: (p) => p.services.map((s) => s.name).join(', ') || '—' },
  { label: 'Identidad', text: (p) => (p.verifications.identity ? '✓ Verificada' : 'Sin verificar') },
];

/**
 * Cómo se llegó a /profesionales:
 *  - 'explore': "quiero ver profesionales" (Home, menú, servicios). Listado
 *    limpio, filtrado solo por lo que viene en la URL. Nunca usa un pedido.
 *  - 'request': desde "Crear solicitud" con un pedido real armado por el
 *    cliente (/profesionales?pedido=1). Muestra y usa ese pedido.
 */
export type SearchMode = 'explore' | 'request';

/**
 * Estado de la pantalla de resultados: filtros del listado real, selección y
 * comparador (máximo 3, mínimo 2).
 */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly request = inject(RequestStore);
  private readonly pros = inject(ProfessionalsStore);
  private readonly catalog = inject(CatalogStore);

  /** Cómo se entró a resultados (ver SearchMode). null = todavía no se entró. */
  readonly mode = signal<SearchMode | null>(null);
  private readonly toast = inject(ToastService);

  /** Profesionales elegidos para comparar/pedir (datos reales del listado). */
  readonly selected = signal<ProfessionalSummary[]>([]);
  readonly selectedIds = computed(() => this.selected().map((p) => p.id));
  readonly compareOpen = signal(false);
  readonly canCompare = computed(() => this.selected().length >= 2);
  /** Solo servicios con requiresLicense (Gas, Electricidad) ofrecen el filtro de matrícula. */
  readonly licenseApplicable = computed(() => this.pros.selectedService()?.requiresLicense ?? false);

  readonly compareRows = computed<CompareRow[]>(() => {
    const list = this.selected();
    const serviceId = this.pros.filters().serviceId;
    const defs: Def[] = this.licenseApplicable()
      ? [
          ...COMPARE_DEFS,
          {
            label: 'Matrícula',
            text: (p) => (hasLicenseFor(p, serviceId) ? '✓ Verificada' : 'Sin matrícula verificada'),
          },
        ]
      : COMPARE_DEFS;
    return defs.map((def) => {
      const values = def.value ? list.map(def.value) : [];
      const numbers = values.filter((v): v is number => v !== null);
      const best = numbers.length ? Math.max(...numbers) : null;
      const allEqual = numbers.length === list.length && numbers.every((v) => v === best);
      return {
        label: def.label,
        cells: list.map((p, i) => ({
          value: def.text(p),
          best: list.length > 1 && best !== null && !allEqual && values[i] === best,
        })),
      };
    });
  });

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
    if (!wasRequest || this.pros.filters().serviceId !== service.id) {
      this.clearSelection();
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
      this.clearSelection();
      this.pros.setFilters({ ...EMPTY_LIST_FILTERS, serviceId });
    } else if (this.pros.filters().serviceId !== serviceId) {
      this.clearSelection();
      this.pros.setFilters({ serviceId, licenseVerified: false });
    } else {
      this.pros.load();
    }
  }

  /** Cambiar el servicio del pedido real (solo en modo 'request'). */
  changeService(service: Service): void {
    this.request.setService(service);
    this.clearSelection();
    this.pros.setFilters({ serviceId: service.id, licenseVerified: false });
  }

  /**
   * Deja listo el pedido para "Solicitar presupuesto". Con un pedido real
   * (modo 'request') se usa ese pedido. Explorando, se arma uno NUEVO y
   * vacío con un servicio que todos los elegidos ofrecen (el filtrado, si
   * hay): título y descripción los completa el cliente en el resumen.
   */
  prepareRequest(pros: ProfessionalSummary[]): void {
    const current = this.request.service();
    const offersAll = (id: string | null | undefined) =>
      !!id && pros.every((p) => p.services.some((s) => s.id === id));
    if (!(this.mode() === 'request' && this.request.hasContext() && offersAll(current?.id))) {
      this.request.resetForNewRequest();
      const candidates = [this.pros.filters().serviceId, ...(pros[0]?.services.map((s) => s.id) ?? [])];
      const id = candidates.find((c) => offersAll(c)) ?? pros[0]?.services[0]?.id;
      const service = this.catalog.activeServices().find((s) => s.id === id);
      if (service) this.request.setService(service);
    }
    this.request.askProfessionals(pros);
  }

  resetForNewRequest(): void {
    this.clearSelection();
  }

  selectionNumber(id: string): number {
    return this.selectedIds().indexOf(id) + 1;
  }

  toggleSelected(pro: ProfessionalSummary): void {
    const list = this.selected();
    if (list.some((p) => p.id === pro.id)) {
      this.selected.set(list.filter((p) => p.id !== pro.id));
      if (list.length - 1 < 2) this.compareOpen.set(false);
      return;
    }
    if (list.length >= MAX_COMPARE) {
      this.toast.show(`Podés comparar hasta ${MAX_COMPARE} profesionales`);
      return;
    }
    this.selected.set([...list, pro]);
  }

  clearSelection(): void {
    this.selected.set([]);
    this.compareOpen.set(false);
  }

  openCompare(): void {
    if (this.canCompare()) this.compareOpen.set(true);
  }

  closeCompare(): void {
    this.compareOpen.set(false);
  }
}
