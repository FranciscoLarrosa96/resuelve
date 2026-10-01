import { Directive, input, signal } from '@angular/core';

/** Visual help for controls that already have an accessible name. No global listeners. */
@Directive({
  selector: '[appTooltip]',
  host: {
    class: 'control-tooltip',
    '[attr.data-tooltip]': 'appTooltip()',
    '[class.tooltip-dismissed]': 'dismissed()',
    '(keydown.escape)': 'dismissed.set(true)',
    '(mouseenter)': 'dismissed.set(false)',
    '(focus)': 'dismissed.set(false)',
  },
})
export class TooltipDirective {
  readonly appTooltip = input.required<string>();
  protected readonly dismissed = signal(false);
}
