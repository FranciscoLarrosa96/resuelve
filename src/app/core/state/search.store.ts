import { Injectable, computed, inject, signal } from '@angular/core';
import { CategoryName } from '../models/category';
import { Professional } from '../models/professional';
import { ProfessionalsService } from '../services/professionals.service';
import { ToastService } from '../services/toast.service';
import { oneDecimal } from '../utils/format';
import { RequestStore } from './request.store';
import { serviceRequiresLicense } from '../data/services.data';

export type SortKey = 'rec' | 'top' | 'near' | 'fast';

export interface SearchFilters {
  today: boolean;
  licensed: boolean;
  fast: boolean;
  minRating: number;
  maxKm: number;
}

export interface CompareRow {
  label: string;
  cells: { value: string; best: boolean }[];
}

const EMPTY_FILTERS: SearchFilters = { today: false, licensed: false, fast: false, minRating: 0, maxKm: 0 };
export const MAX_COMPARE = 3;

const SORTERS: Record<SortKey, (a: Professional, b: Professional) => number> = {
  rec: (a, b) =>
    Number(b.availableToday) - Number(a.availableToday) || b.rating - a.rating || b.reviewsCount - a.reviewsCount,
  top: (a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount,
  near: (a, b) => a.distanceKm - b.distanceKm,
  fast: (a, b) => a.responseMinutes - b.responseMinutes,
};

type NumericField = (p: Professional) => number;
const COMPARE_DEFS: { label: string; text: (p: Professional) => string; value?: NumericField; higherIsBetter?: boolean }[] = [
  { label: 'Valoración', text: (p) => '★ ' + oneDecimal(p.rating), value: (p) => p.rating, higherIsBetter: true },
  { label: 'Opiniones', text: (p) => `${p.reviewsCount} opiniones`, value: (p) => p.reviewsCount, higherIsBetter: true },
  { label: 'Trabajos realizados', text: (p) => `${p.jobsCount} trabajos`, value: (p) => p.jobsCount, higherIsBetter: true },
  { label: 'Experiencia', text: (p) => `${p.yearsExperience} años`, value: (p) => p.yearsExperience, higherIsBetter: true },
  { label: 'Distancia', text: (p) => oneDecimal(p.distanceKm) + ' km', value: (p) => p.distanceKm, higherIsBetter: false },
  { label: 'Responde en', text: (p) => p.responseTime, value: (p) => p.responseMinutes, higherIsBetter: false },
  {
    label: 'Disponibilidad',
    text: (p) => (p.availableToday ? 'Disponible hoy' : 'Disponible mañana'),
    value: (p) => Number(p.availableToday),
    higherIsBetter: true,
  },
  { label: 'Próximo turno', text: (p) => p.nextSlot },
  { label: 'Identidad', text: () => '✓ Verificada' },
  { label: 'Matrícula', text: (p) => (p.licenseVerified ? '✓ ' + p.licenseLabel : 'Sin matrícula verificada') },
];

/** Resultados, filtros, orden, mapa y comparador. */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly pros = inject(ProfessionalsService);
  private readonly request = inject(RequestStore);
  private readonly toast = inject(ToastService);

  readonly filters = signal<SearchFilters>(EMPTY_FILTERS);
  readonly sort = signal<SortKey>('rec');
  readonly loading = signal(false);
  readonly selectedIds = signal<string[]>([]);
  readonly hoverId = signal<string | null>(null);
  readonly compareOpen = signal(false);
  readonly licenseApplicable = computed(() => serviceRequiresLicense(this.request.draft().category));
  private loadingTimer?: ReturnType<typeof setTimeout>;

  readonly results = computed(() => {
    const f = this.filters();
    let list = this.pros.inCategory(this.request.draft().category);
    if (f.today) list = list.filter((p) => p.availableToday);
    if (f.licensed && this.licenseApplicable()) list = list.filter((p) => p.licenseVerified);
    if (f.fast) list = list.filter((p) => p.responseMinutes < 15);
    if (f.minRating) list = list.filter((p) => p.rating >= f.minRating);
    if (f.maxKm) list = list.filter((p) => p.distanceKm <= f.maxKm);
    return [...list].sort(SORTERS[this.sort()]);
  });

  readonly selected = computed(() => this.pros.many(this.selectedIds()));
  readonly canCompare = computed(() => this.selectedIds().length >= 2);

  readonly compareRows = computed<CompareRow[]>(() => {
    const list = this.selected();
    return COMPARE_DEFS.filter((def) => def.label !== 'Matrícula' || this.licenseApplicable()).map((def) => {
      const values = def.value ? list.map(def.value) : [];
      let bestFlags = list.map(() => false);
      if (def.value && list.length > 1) {
        const best = def.higherIsBetter ? Math.max(...values) : Math.min(...values);
        const allEqual = values.every((v) => v === best);
        bestFlags = values.map((v) => !allEqual && v === best);
      }
      return { label: def.label, cells: list.map((p, i) => ({ value: def.text(p), best: bestFlags[i] })) };
    });
  });

  /**
   * Al entrar a resultados: si el pedido cambió desde la última búsqueda,
   * simula la búsqueda y limpia la comparación. Si no (p. ej. al volver
   * desde un perfil), conserva la selección.
   */
  enter(): void {
    const key = this.requestKey();
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.selectedIds.set([]);
    this.compareOpen.set(false);
    this.simulateLoading(900);
  }

  /** Fuerza una nueva búsqueda la próxima vez que se entre a resultados. */
  invalidate(): void {
    this.lastKey = null;
  }

  changeCategory(category: CategoryName): void {
    this.request.setCategory(category);
    if (!this.licenseApplicable()) this.setFilter('licensed', false);
    this.lastKey = this.requestKey();
    this.selectedIds.set([]);
    this.simulateLoading(700);
  }

  private lastKey: string | null = null;

  private requestKey(): string {
    const d = this.request.draft();
    return [d.category, d.problem, d.zone, d.urgency, d.when, d.text].join('|');
  }

  setFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]): void {
    if (key === 'licensed' && !this.licenseApplicable()) return;
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  toggleFilter(key: 'today' | 'licensed' | 'fast'): void {
    if (key === 'licensed' && !this.licenseApplicable()) return;
    this.filters.update((f) => ({ ...f, [key]: !f[key] }));
  }

  /** Chips mobile "Mejor valorados" / "Más cerca": alternan el orden. */
  toggleSort(key: SortKey): void {
    this.sort.update((current) => (current === key ? 'rec' : key));
  }

  clearFilters(): void {
    this.filters.set(EMPTY_FILTERS);
  }

  resetForNewRequest(): void {
    clearTimeout(this.loadingTimer);
    this.loading.set(false);
    this.clearFilters();
    this.sort.set('rec');
    this.clearSelection();
    this.hoverId.set(null);
    this.invalidate();
  }

  selectionNumber(id: string): number {
    return this.selectedIds().indexOf(id) + 1;
  }

  toggleSelected(id: string): void {
    if (!this.pros.byId(id)) return;
    const ids = this.selectedIds();
    if (ids.includes(id)) {
      this.selectedIds.set(ids.filter((x) => x !== id));
      if (ids.length - 1 < 2) this.compareOpen.set(false);
      return;
    }
    if (ids.length >= MAX_COMPARE) {
      this.toast.show(`Podés comparar hasta ${MAX_COMPARE} profesionales`);
      return;
    }
    this.selectedIds.set([...ids, id]);
  }

  clearSelection(): void {
    this.selectedIds.set([]);
    this.compareOpen.set(false);
  }

  openCompare(): void {
    if (this.selected().length >= 2) this.compareOpen.set(true);
  }

  closeCompare(): void {
    this.compareOpen.set(false);
  }

  private simulateLoading(delay: number): void {
    this.loading.set(true);
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => this.loading.set(false), delay);
  }
}
