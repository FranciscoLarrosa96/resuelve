import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

/** Pastilla verde "✓ Identidad verificada", "✓ Matrícula verificada"… */
@Component({
  selector: 'app-check-badge',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center gap-1 rounded-full bg-brand-soft font-medium text-brand',
    '[class]': "size() === 'md' ? 'px-[11px] py-[5px] text-[13px]' : 'px-[9px] py-1 text-xs'",
  },
  template: `<app-icon name="check" [size]="size() === 'md' ? 12 : 11" [stroke]="3.2" />{{ label() }}`,
})
export class CheckBadge {
  readonly label = input.required<string>();
  readonly size = input<'sm' | 'md'>('sm');
}
