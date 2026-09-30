import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabsDirective } from './tabs.directive';

@Component({
  imports: [TabsDirective],
  template: `<div appTabs role="tablist">
    @for (value of [0, 1, 2]; track value) {
      <button role="tab" [disabled]="value === 1" [attr.aria-selected]="selected() === value" (click)="selected.set(value)">{{ value }}</button>
    }
  </div>`,
})
class TabsFixture { selected = signal(0); }

describe('Keyboard tabs', () => {
  it('has one tab stop and follows click selection', async () => {
    const fixture = TestBed.createComponent(TabsFixture);
    fixture.detectChanges();
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    expect([...buttons].map(button => button.tabIndex)).toEqual([0, -1, -1]);
    buttons[2].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect([...buttons].map(button => button.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('arrows skip disabled tabs and wrap; Home and End select the bounds', async () => {
    const fixture = TestBed.createComponent(TabsFixture);
    fixture.detectChanges();
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const key = (button: HTMLButtonElement, key: string) => button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    key(buttons[0], 'ArrowRight');
    expect(fixture.componentInstance.selected()).toBe(2);
    key(buttons[2], 'ArrowRight');
    expect(fixture.componentInstance.selected()).toBe(0);
    key(buttons[0], 'End');
    expect(fixture.componentInstance.selected()).toBe(2);
    key(buttons[2], 'Home');
    expect(fixture.componentInstance.selected()).toBe(0);
  });
});
