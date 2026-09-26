import { Directive, input } from '@angular/core';

/**
 * Botón-chip seleccionable (categorías, barrios, filtros, horarios…).
 * El padding / radio / tamaño de texto los define cada uso.
 *
 *   <button type="button" [appChip]="isActive" class="rounded-full px-4 py-2.5">…</button>
 */
@Directive({
  selector: 'button[appChip]',
  host: {
    type: 'button',
    class: 'border-[1.5px] font-semibold press',
    '[class.border-brand]': 'active()',
    '[class.bg-brand]': 'active()',
    '[class.text-white]': 'active()',
    '[class.border-line-input]': '!active()',
    '[class.bg-white]': '!active()',
    '[class.text-ink]': '!active()',
    '[attr.aria-pressed]': 'active()',
  },
})
export class ChipDirective {
  readonly active = input(false, { alias: 'appChip' });
}
