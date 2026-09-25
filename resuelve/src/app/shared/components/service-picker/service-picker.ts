import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { findServices } from '../../../core/data/services.data';
import { CategoryName } from '../../../core/models/category';

@Component({
  selector: 'app-service-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="block text-xs font-semibold tracking-[0.06em] text-muted uppercase" [for]="fieldId()">Servicio</label>
    <input [id]="fieldId()" type="search" placeholder="Buscar servicio..." autocomplete="off"
      class="mt-2 w-full min-w-0 rounded-xl border border-line-input bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
      [value]="query()" (input)="query.set($any($event.target).value)" />
    @if (query().trim()) {
      <div class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-soft">
        @for (service of matches(); track service.id) {
          <button type="button" class="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-brand-tint"
            (click)="chosen.emit(service.id); query.set(''); showSelected.set(true)">{{ service.id }} <span class="text-xs text-muted">· {{ service.category }}</span></button>
        } @empty {
          <p class="px-2.5 py-2 text-sm text-muted">No encontramos ese servicio.</p>
        }
      </div>
    }
    @if (showSelected()) {
      <div class="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">
        <span class="truncate">{{ selected() }}</span>
        <button type="button" aria-label="Cambiar servicio seleccionado" (click)="showSelected.set(false)">×</button>
      </div>
    }
  `,
})
export class ServicePicker {
  readonly fieldId = input.required<string>();
  readonly selected = input.required<CategoryName>();
  readonly chosen = output<CategoryName>();
  protected readonly showSelected = signal(true);
  protected readonly query = signal('');
  protected readonly matches = computed(() => findServices(this.query()));
}
