import { Directive, ElementRef, afterEveryRender, inject } from '@angular/core';

/** Keyboard and focus behavior for existing tab/segmented controls. Selection stays with their stores. */
@Directive({
  selector: '[appTabs]',
  host: { class: 'tab-strip', '(keydown)': 'navigate($event)' },
})
export class TabsDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      for (const button of this.buttons(true)) {
        const selected = button.getAttribute('aria-selected') === 'true' || button.getAttribute('aria-checked') === 'true';
        button.tabIndex = selected && !button.disabled ? 0 : -1;
      }
    });
  }

  protected navigate(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = this.buttons();
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  }

  private buttons(includeDisabled = false): HTMLButtonElement[] {
    return Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('button[role="tab"], button[role="radio"]')).filter(button => includeDisabled || !button.disabled);
  }
}
