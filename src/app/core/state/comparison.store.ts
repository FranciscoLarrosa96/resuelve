import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProfessionalSummary, coverageText, hasLicenseFor } from '../models/professional';
import { ToastService } from '../services/toast.service';
import { oneDecimal } from '../utils/format';
import { noReviewsText } from '../utils/reputation';
import { CatalogStore } from './catalog.store';
import { ProfessionalsStore } from './professionals.store';

export interface CompareRow {
  label: string;
  cells: { value: string; best: boolean }[];
}

export const MAX_COMPARE = 6;
export const COMPARE_LIMIT_MESSAGE = `Podés comparar hasta ${MAX_COMPARE} profesionales.`;

const STORAGE_KEY = 'resuelve.comparison';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Def = {
  label: string;
  text: (p: ProfessionalSummary) => string;
  /** Valor numérico para marcar "Mejor". null = no comparable (p. ej. sin reseñas). */
  value?: (p: ProfessionalSummary) => number | null;
  /** Fila condicional: solo se muestra si alguno de los comparados cumple (p. ej. identidad, que hoy casi nadie tiene). */
  onlyIf?: (p: ProfessionalSummary) => boolean;
};

/** Solo datos reales del contrato público. Nada de distancia, precios ni tiempos de respuesta. */
const COMPARE_DEFS: Def[] = [
  {
    label: 'Valoración',
    text: (p) => (p.averageRating === null ? noReviewsText(p) : '★ ' + oneDecimal(p.averageRating)),
    value: (p) => p.averageRating,
  },
  { label: 'Reseñas', text: (p) => String(p.reviewsCount), value: (p) => (p.reviewsCount ? p.reviewsCount : null) },
  {
    label: 'Trabajos por Resuelve',
    text: (p) => String(p.completedJobsCount),
    value: (p) => (p.completedJobsCount ? p.completedJobsCount : null),
  },
  { label: 'Experiencia', text: (p) => `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'}` },
  { label: 'Urgencias', text: (p) => (p.availableToday ? 'Toma urgencias' : 'No toma urgencias ahora') },
  { label: 'Zonas', text: (p) => coverageText(p) || '—' },
  { label: 'Servicios', text: (p) => p.services.map((s) => s.name).join(', ') || '—' },
  {
    label: 'Identidad',
    text: (p) => (p.verifications.identity ? '✓ Verificada' : '—'),
    onlyIf: (p) => p.verifications.identity,
  },
];

/** Solo lo público que usa el comparador (sin fotos de trabajos ni bio larga). */
function toStored(p: ProfessionalSummary): ProfessionalSummary {
  const { workPhotos: _workPhotos, ...rest } = p as ProfessionalSummary & { workPhotos?: unknown };
  return rest;
}

/**
 * ÚNICA fuente de "a quién estoy comparando" (resultados, tarjetas y perfil
 * público usan esto). Máximo 6, mínimo 2 para abrir el comparador.
 *
 * Antes la selección vivía en la pantalla de resultados: el botón del perfil
 * la cambiaba sin ninguna bandeja visible, el comparador solo existía en
 * /profesionales y entrar a resultados desde un perfil la vaciaba. Ahora no
 * depende de filtros ni de cómo se llegó, y sobrevive a navegar y a un F5
 * (sessionStorage, solo datos públicos).
 */
@Injectable({ providedIn: 'root' })
export class ComparisonStore {
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsStore);
  private readonly catalog = inject(CatalogStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly selected = signal<ProfessionalSummary[]>([]);
  readonly selectedIds = computed(() => this.selected().map((p) => p.id));
  readonly count = computed(() => this.selected().length);
  readonly canCompare = computed(() => this.count() >= 2);
  readonly full = computed(() => this.count() >= MAX_COMPARE);
  readonly open = signal(false);

  /**
   * Servicio de contexto para la fila "Matrícula": el filtrado en resultados
   * (o el del pedido). Sin contexto (perfil abierto por link) no se afirma
   * nada sobre matrícula: la fila no aparece.
   */
  private readonly contextService = computed(() => {
    const id = this.pros.filters().serviceId;
    return id ? (this.catalog.activeServices().find((s) => s.id === id) ?? null) : null;
  });

  readonly rows = computed<CompareRow[]>(() => {
    const list = this.selected();
    const service = this.contextService();
    const defs: Def[] = service?.requiresLicense
      ? [
          ...COMPARE_DEFS,
          {
            label: `Matrícula (${service.name})`,
            text: (p) => (hasLicenseFor(p, service.id) ? '✓ Verificada' : 'Sin matrícula verificada'),
          },
        ]
      : COMPARE_DEFS;
    return defs.filter((def) => !def.onlyIf || list.some(def.onlyIf)).map((def) => {
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

  constructor() {
    if (!this.isBrowser) return;
    this.selected.set(this.read());
    effect(() => {
      const list = this.selected();
      untracked(() => this.write(list));
    });
  }

  has(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  position(id: string): number {
    return this.selectedIds().indexOf(id) + 1;
  }

  /** Agrega; con 3 ya elegidos no agrega y avisa. Devuelve si quedó en la comparación. */
  add(pro: ProfessionalSummary): boolean {
    if (this.has(pro.id)) return true;
    if (this.full()) {
      this.toast.show(COMPARE_LIMIT_MESSAGE);
      return false;
    }
    this.selected.update((list) => [...list, toStored(pro)]);
    return true;
  }

  remove(id: string): void {
    this.selected.update((list) => list.filter((p) => p.id !== id));
    if (this.count() < 2) this.open.set(false);
  }

  toggle(pro: ProfessionalSummary): void {
    if (this.has(pro.id)) this.remove(pro.id);
    else this.add(pro);
  }

  clear(): void {
    this.selected.set([]);
    this.open.set(false);
  }

  openCompare(): void {
    if (this.canCompare()) this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  private read(): ProfessionalSummary[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as ProfessionalSummary[]) : [];
      return Array.isArray(list)
        ? list.filter((p) => p && typeof p.id === 'string' && UUID.test(p.id) && Array.isArray(p.services)).slice(0, MAX_COMPARE)
        : [];
    } catch {
      return [];
    }
  }

  private write(list: ProfessionalSummary[]): void {
    try {
      if (list.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin storage: vale para esta pestaña */
    }
  }
}
