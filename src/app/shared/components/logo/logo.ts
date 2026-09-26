import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marca: tilde + "Resuelve". Sin sufijos: "Resuelve PRO" queda reservado para el futuro plan pago. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <span
      class="flex items-center justify-center bg-brand text-white"
      [class]="size() === 'lg' ? 'size-[30px] rounded-lg' : 'size-7 rounded-lg'"
      aria-hidden="true"
    >
      <svg [attr.width]="size() === 'lg' ? 16 : 15" [attr.height]="size() === 'lg' ? 16 : 15" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    </span>
    <span
      class="font-sans font-bold tracking-[-0.025em] text-ink"
      [class]="size() === 'lg' ? 'text-xl' : 'text-lg'"
    >Resuelve</span>
  `,
})
export class Logo {
  readonly size = input<'md' | 'lg'>('md');
}
