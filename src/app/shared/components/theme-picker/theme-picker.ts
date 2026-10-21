import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { THEME_OPTIONS, ThemePreference, ThemeStore } from '../../../core/state/theme.store';

/** Selector nativo: visible sin abrir la cuenta, con teclado y las tres preferencias existentes. */
@Component({
  selector: 'app-theme-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <label class="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-sm text-ink">
      <span class="font-semibold">Tema</span>
      <select aria-label="Tema de la interfaz" class="min-h-11 min-w-0 max-w-24 cursor-pointer bg-surface text-ink focus-visible:outline-2 focus-visible:outline-brand"
        [value]="theme.preference()" (change)="choose($event)">
        @for (option of options; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
    </label>
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeStore);
  protected readonly options = THEME_OPTIONS;
  protected choose(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (this.options.some((option) => option.value === value)) this.theme.set(value as ThemePreference);
  }
}
