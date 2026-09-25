import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CATEGORIES, CITY } from '../../../core/data/catalog.data';
import { Professional } from '../../../core/models/professional';
import { RequestStore } from '../../../core/state/request.store';
import { MAX_COMPARE, SearchStore, SortKey } from '../../../core/state/search.store';
import { oneDecimal, pluralize } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { MapMock } from '../../../shared/components/map-mock/map-mock';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { CompareDialog } from './compare-dialog/compare-dialog';
import { ResultCard } from './result-card/result-card';
import { ResultCardMobile } from './result-card-mobile/result-card-mobile';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';

@Component({
  selector: 'app-results-page',
  imports: [
    RouterLink,
    Avatar,
    BackButton,
    Icon,
    MapMock,
    ChipDirective,
    CompareDialog,
    ResultCard,
    ResultCardMobile,
    ServicePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './results-page.html',
})
export class ResultsPage {
  private readonly router = inject(Router);
  protected readonly search = inject(SearchStore);
  protected readonly request = inject(RequestStore);

  protected readonly city = CITY;
  protected readonly categories = CATEGORIES;
  protected readonly draft = this.request.draft;
  protected readonly results = this.search.results;
  protected readonly filters = this.search.filters;
  protected readonly selected = this.search.selected;
  protected readonly skeletons = [1, 2, 3];
  protected readonly f1 = oneDecimal;
  protected readonly maxCompare = MAX_COMPARE;

  /** Mobile: desplegable de categorías debajo de los chips. */
  protected readonly showCategories = signal(false);

  protected readonly sortOptions: { key: SortKey; label: string }[] = [
    { key: 'rec', label: 'Recomendados' },
    { key: 'top', label: 'Mejor valorados' },
    { key: 'near', label: 'Más cerca' },
    { key: 'fast', label: 'Responden rápido' },
  ];
  protected readonly checkFilters: { key: 'today' | 'licensed' | 'fast'; label: string }[] = [
    { key: 'today', label: 'Disponible hoy' },
    { key: 'licensed', label: 'Matrícula verificada' },
    { key: 'fast', label: 'Responde en menos de 15 min' },
  ];
  protected readonly ratingOptions = [
    { value: 0, label: 'Todas' },
    { value: 4.5, label: '4,5 +' },
    { value: 4.8, label: '4,8 +' },
  ];
  protected readonly distanceOptions = [
    { value: 0, label: 'Todas' },
    { value: 2, label: '2 km' },
    { value: 5, label: '5 km' },
  ];

  protected readonly title = computed(() => {
    if (this.search.loading()) return `Buscando en ${CITY}…`;
    const n = this.results().length;
    return `${pluralize(n, 'profesional', 'profesionales')} para ${this.draft().problem.toLowerCase()}`;
  });

  protected readonly mobileCount = computed(() => {
    if (this.search.loading()) return `Buscando profesionales en ${CITY}…`;
    const n = this.results().length;
    return `${pluralize(n, 'profesional', 'profesionales')} en ${CITY} · tocá ✓ para comparar hasta ${MAX_COMPARE}`;
  });

  protected readonly selectionTitle = computed(() => {
    const n = this.selected().length;
    return n >= 2 ? `${n} profesionales seleccionados` : '1 profesional seleccionado';
  });
  protected readonly selectionHint = computed(() => {
    const n = this.selected().length;
    if (n < 2) return 'Sumá al menos uno más para comparar';
    return n < MAX_COMPARE ? 'Podés sumar uno más' : 'Máximo alcanzado';
  });
  protected readonly askSelectedLabel = computed(() => {
    const n = this.selected().length;
    return n === 1 ? 'Pedir presupuesto' : `Pedir presupuesto a los ${n}`;
  });
  protected readonly askSelectedLabelMobile = computed(() => {
    const n = this.selected().length;
    return `Pedir presupuesto a ${pluralize(n, 'profesional', 'profesionales')}`;
  });

  constructor() {
    this.search.enter();
  }

  protected pinScale(pro: Professional): number {
    return this.search.hoverId() === pro.id ? 1.18 : 1;
  }

  protected pinHighlighted(pro: Professional): boolean {
    return this.search.hoverId() === pro.id || this.search.selectedIds().includes(pro.id);
  }

  protected pinZ(pro: Professional): number {
    if (this.search.hoverId() === pro.id) return 6;
    return this.search.selectedIds().includes(pro.id) ? 5 : 1;
  }

  protected pickCategory(name: (typeof CATEGORIES)[number]['name']): void {
    this.showCategories.set(false);
    this.search.changeCategory(name);
  }

  protected goHome(): void {
    this.router.navigate(['/']);
  }

  protected editRequest(): void {
    this.request.goToStep(5);
    this.router.navigate(['/solicitud']);
  }

  protected ask(pro: Professional): void {
    this.request.askProfessionals([pro.id]);
    this.router.navigate(['/presupuesto']);
  }

  protected askSelected(): void {
    this.request.askProfessionals(this.search.selectedIds());
    this.router.navigate(['/presupuesto']);
  }
}
