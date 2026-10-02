import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '../icon/icon';
import { ZoneAutocomplete, ZoneOption } from './zone-autocomplete';

/**
 * Cobertura por barrios del profesional: buscás y sumás con el autocompletado;
 * los elegidos quedan como fichas que se quitan con un toque. La lista que
 * guarda es la de ids (el padre decide: `toggle` suma o quita).
 */
@Component({
  selector: 'app-zone-coverage-picker',
  imports: [ZoneAutocomplete, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-zone-autocomplete
      [inputId]="inputId()"
      [zones]="zones()"
      [excludeIds]="selectedIds()"
      [labelledBy]="labelledBy()"
      placeholder="Buscá un barrio y sumalo"
      (chosen)="toggle.emit($event.id)"
    />
    @if (selected().length) {
      <ul class="mt-3 flex list-none flex-wrap gap-2 p-0" aria-label="Barrios elegidos">
        @for (z of selected(); track z.id) {
          <li>
            <button
              type="button"
              class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand bg-brand-tint py-1.5 pr-2.5 pl-3.5 text-[14.5px] font-semibold text-brand-dark hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              [attr.aria-label]="'Quitar ' + z.name"
              (click)="toggle.emit(z.id)"
            >
              {{ z.name }}<app-icon name="close" [size]="15" [stroke]="2.4" />
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="mt-3 text-[14px] text-muted">Todavía no elegiste ningún barrio.</p>
    }
  `,
})
export class ZoneCoveragePicker {
  readonly zones = input.required<readonly ZoneOption[]>();
  readonly selectedIds = input.required<readonly string[]>();
  readonly inputId = input('coverage-zone-search');
  readonly labelledBy = input<string | null>(null);
  readonly toggle = output<string>();

  /** Elegidos, en el orden del catálogo. */
  protected readonly selected = computed(() => this.zones().filter((z) => this.selectedIds().includes(z.id)));
}
