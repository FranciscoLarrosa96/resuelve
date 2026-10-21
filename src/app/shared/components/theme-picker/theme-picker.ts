import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeStore } from '../../../core/state/theme.store';
import { Icon } from '../icon/icon';

/** Acceso directo al tema; la preferencia automática sigue disponible en el menú de cuenta. */
@Component({
  selector: 'app-theme-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <div role="group" aria-label="Tema de la interfaz" class="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
      <button type="button" aria-label="Activar tema claro" title="Tema claro"
        [attr.aria-pressed]="theme.resolved() === 'light'" (click)="theme.set('light')"
        class="grid size-11 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        [class]="theme.resolved() === 'light' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-brand-soft hover:text-brand'">
        <app-icon name="sun" [size]="20" [stroke]="1.9" />
      </button>
      <button type="button" aria-label="Activar tema oscuro" title="Tema oscuro"
        [attr.aria-pressed]="theme.resolved() === 'dark'" (click)="theme.set('dark')"
        class="grid size-11 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        [class]="theme.resolved() === 'dark' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-brand-soft hover:text-brand'">
        <app-icon name="moon" [size]="20" [stroke]="1.9" />
      </button>
    </div>
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeStore);
}
