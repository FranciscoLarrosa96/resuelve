import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Service } from '../../../core/models/category';
import { CatalogStore } from '../../../core/state/catalog.store';
import { searchServices } from '../../../core/utils/catalog-search';
import { CatalogError } from '../catalog-error/catalog-error';

/** Buscador de servicios sobre el catálogo real del backend. */
@Component({
  selector: 'app-service-picker',
  imports: [CatalogError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="block text-sm font-semibold text-ink-soft" [for]="fieldId()">Servicio</label>
    <input [id]="fieldId()" type="search" placeholder="Buscar servicio..." autocomplete="off"
      class="mt-2 w-full min-w-0 rounded-xl border border-line-input bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
      [value]="query()" (input)="query.set($any($event.target).value)" />
    @if (catalog.error() && !catalog.loaded()) {
      <div class="mt-2"><app-catalog-error [compact]="true" /></div>
    } @else if (query().trim()) {
      <div class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-soft">
        @if (catalog.pending()) {
          <p class="px-2.5 py-2 text-sm text-muted" role="status">Cargando servicios…</p>
        } @else {
          @for (service of matches(); track service.id) {
            <button type="button" class="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-brand-tint"
              (click)="choose(service)">{{ service.name }} <span class="text-xs text-muted">· {{ catalog.categoryOf(service)?.name }}</span></button>
          } @empty {
            <p class="px-2.5 py-2 text-sm text-muted">No encontramos ese servicio.</p>
          }
        }
      </div>
    }
    @if (showSelected() && selectedName()) {
      <div class="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
        <span class="truncate">{{ selectedName() }}</span>
        <button type="button" aria-label="Cambiar servicio seleccionado" (click)="showSelected.set(false)">×</button>
      </div>
    }
  `,
})
export class ServicePicker {
  protected readonly catalog = inject(CatalogStore);
  readonly fieldId = input.required<string>();
  /** Slug del servicio elegido. */
  readonly selected = input.required<string>();
  readonly chosen = output<Service>();
  protected readonly showSelected = signal(true);
  protected readonly query = signal('');
  protected readonly matches = computed(() =>
    searchServices(this.catalog.activeServices(), this.catalog.categories(), this.query()),
  );
  protected readonly selectedName = computed(() => this.catalog.serviceBySlug(this.selected())?.name ?? '');

  constructor() {
    this.catalog.loadCatalog();
  }

  protected choose(service: Service): void {
    this.chosen.emit(service);
    this.query.set('');
    this.showSelected.set(true);
  }
}
