import { Injectable, computed, inject, signal } from '@angular/core';
import { Service } from '../models/category';
import { ProfessionalSummary, coverageText, hasLicenseFor } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { oneDecimal } from '../utils/format';
import { ProfessionalsStore } from './professionals.store';
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
 * Estado de la pantalla de resultados: servicio del pedido → filtros del
 * listado real, selección y comparador (máximo 3, mínimo 2).
 */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly request = inject(RequestStore);
  private readonly pros = inject(ProfessionalsStore);
  private readonly toast = inject(ToastService);

  /** Profesionales elegidos para comparar/pedir (datos reales del listado). */
  readonly selected = signal<ProfessionalSummary[]>([]);
  readonly selectedIds = computed(() => this.selected().map((p) => p.id));
  readonly compareOpen = signal(false);
  readonly canCompare = computed(() => this.selected().length >= 2);
  /** Solo Gas y Electricidad (requiresLicense del catálogo) ofrecen el filtro de matrícula. */
  readonly licenseApplicable = computed(() => this.request.service()?.requiresLicense ?? false);

  readonly compareRows = computed<CompareRow[]>(() => {
    const list = this.selected();
    const serviceId = this.request.service()?.id;
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
  enter(): void {
    const service = this.request.service();
    if (!service) return;
    if (this.pros.filters().serviceId !== service.id) {
      this.clearSelection();
      this.pros.setFilters({ serviceId: service.id, licenseVerified: false });
    } else {
      this.pros.load();
    }
  }

  changeService(service: Service): void {
    this.request.setService(service);
    this.clearSelection();
    this.pros.setFilters({ serviceId: service.id, licenseVerified: false });
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
