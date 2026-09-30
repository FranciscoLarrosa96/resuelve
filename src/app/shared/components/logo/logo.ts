import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marca: el ícono de la app (casa + tilde, el mismo del favicon) + "Resuelve". Sin sufijos: "Resuelve PRO" queda reservado para el futuro plan pago. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5' },
  template: `
    <img
      src="logo-96.png"
      alt=""
      aria-hidden="true"
      [attr.width]="size() === 'lg' ? 30 : 28"
      [attr.height]="size() === 'lg' ? 30 : 28"
      class="shrink-0 rounded-[7px]"
      [class]="size() === 'lg' ? 'size-[30px]' : 'size-7'"
    />
    <span
      class="font-sans font-bold tracking-[-0.025em]"
      [class]="size() === 'lg' ? 'text-xl' : 'text-lg'"
      [class.text-on-brand]="tone() === 'on-brand'"
      [class.text-ink]="tone() !== 'on-brand'"
    >Resuelve</span>
  `,
})
export class Logo {
  readonly size = input<'md' | 'lg'>('md');
  readonly tone = input<'default' | 'on-brand'>('default');
}
