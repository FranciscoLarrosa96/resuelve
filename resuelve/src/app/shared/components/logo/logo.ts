import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <span
      class="flex items-center justify-center bg-brand text-white"
      [class]="size() === 'lg' ? 'size-[30px] rounded-[10px]' : 'size-7 rounded-[9px]'"
      aria-hidden="true"
    >
      <svg [attr.width]="size() === 'lg' ? 16 : 15" [attr.height]="size() === 'lg' ? 16 : 15" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    </span>
    <span
      class="font-display font-bold tracking-[-0.02em] text-ink"
      [class]="size() === 'lg' ? 'text-xl' : 'text-lg'"
    >Resuelve</span>
    @if (pro()) {
      <span class="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">Pro</span>
    }
  `,
})
export class Logo {
  readonly size = input<'md' | 'lg'>('md');
  readonly pro = input(false);
}
