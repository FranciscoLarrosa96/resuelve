import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '../icon/icon';

/** Botón cuadrado "volver" (mobile y encabezados de flujo). */
@Component({
  selector: 'app-back-button',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <button
      type="button"
      class="flex items-center justify-center rounded-xl border border-line-input bg-white text-ink transition-colors hover:bg-sand-light"
      [class]="large() ? 'size-[42px]' : 'size-10'"
      [attr.aria-label]="label()"
      (click)="pressed.emit()"
    >
      <app-icon name="chevron-left" [size]="18" [stroke]="2.4" />
    </button>
  `,
})
export class BackButton {
  readonly label = input('Volver');
  readonly large = input(false);
  readonly pressed = output<void>();
}
