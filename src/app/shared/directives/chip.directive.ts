import { Directive, HostAttributeToken, inject, input } from '@angular/core';

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
    class: 'border-[1.5px] font-semibold transition-colors press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand hover:border-brand/50',
    '[class.border-brand]': 'active()',
    '[class.bg-primary]': 'active()',
    '[class.text-white]': 'active()',
    '[class.border-line-input]': '!active()',
    '[class.bg-surface]': '!active()',
    '[class.text-ink]': '!active()',
    // Con role=radio/checkbox el estado va en aria-checked (lo pone quien lo usa).
    '[attr.aria-pressed]': 'role ? null : active()',
  },
})
export class ChipDirective {
  protected readonly role = inject(new HostAttributeToken('role'), { optional: true });
  readonly active = input(false, { alias: 'appChip' });
}
