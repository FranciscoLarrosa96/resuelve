import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

export type TagTone = 'brand' | 'neutral' | 'accent' | 'info';

const TONES: Record<TagTone, string> = {
  brand: 'border-brand-line bg-brand-tint text-brand-dark',
  neutral: 'border-line bg-white text-ink-soft',
  accent: 'border-accent-line bg-accent-soft text-accent-ink',
  info: 'border-[#cfdeea] bg-info-soft text-info',
};

/**
 * Etiqueta chica y fina (señales de confianza, estados secundarios). Radio de
 * 6 px, borde de 1 px y texto de 12 px: informa sin gritar. El significado
 * siempre va en el texto (y opcionalmente un ícono), nunca solo en el color.
 */
@Component({
  selector: 'app-tag',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex max-w-full items-center gap-1 rounded-[6px] border px-1.75 py-0.5 text-[12px] leading-4 font-medium whitespace-nowrap',
    '[class]': 'tones[tone()]',
  },
  template: `
    @if (icon(); as name) {
      <app-icon [name]="name" [size]="12" [stroke]="2.3" />
    }
    <span class="truncate"><ng-content /></span>
  `,
})
export class Tag {
  readonly tone = input<TagTone>('neutral');
  readonly icon = input<IconName | null>(null);
  protected readonly tones = TONES;
}
