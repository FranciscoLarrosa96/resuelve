import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { starsLabel } from '../../../core/utils/reputation';

const STAR = 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z';

/** Puntaje de una reseña (1 a 5), solo lectura. Para lectores de pantalla: "4 de 5 estrellas". */
@Component({
  selector: 'app-stars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-0.5', role: 'img', '[attr.aria-label]': 'label()' },
  template: `
    @for (i of five; track i) {
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" aria-hidden="true"
        [class]="i <= rating() ? 'fill-accent text-accent' : 'fill-none text-line-dash'"
        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <path [attr.d]="star" />
      </svg>
    }
  `,
})
export class Stars {
  readonly rating = input.required<number>();
  readonly size = input(14);
  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly star = STAR;
  protected readonly label = computed(() => starsLabel(this.rating()));
}

/**
 * Selector de puntaje accesible: 5 radios nativos (flechas del teclado,
 * Tab entra y sale del grupo, lector de pantalla anuncia "3 estrellas, 3 de 5").
 * El texto del puntaje elegido es neutro (no cambia el tono según el valor).
 */
@Component({
  selector: 'app-star-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [attr.aria-describedby]="describedBy() || null" [disabled]="disabled()">
      <legend class="text-[15px] font-semibold text-ink">{{ legend() }}</legend>
      <div class="mt-2 flex items-center gap-1">
        @for (i of five; track i) {
          <label
            class="relative flex size-11 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand has-[:disabled]:cursor-not-allowed hover:bg-sand-light"
          >
            <input
              type="radio"
              class="peer sr-only"
              [name]="name()"
              [value]="i"
              [checked]="value() === i"
              [attr.aria-label]="i === 1 ? '1 estrella' : i + ' estrellas'"
              (change)="value.set(i)"
            />
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"
              [class]="value() !== null && i <= value()! ? 'fill-accent text-accent' : 'fill-none text-muted'"
              stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
              <path [attr.d]="star" />
            </svg>
          </label>
        }
        <span class="ml-2 text-[14px] text-muted tabular-nums" aria-hidden="true">{{ value() ? value() + ' de 5' : '' }}</span>
      </div>
    </fieldset>
  `,
})
export class StarInput {
  readonly value = model<number | null>(null);
  readonly name = input('rating');
  readonly legend = input('¿Cómo fue tu experiencia?');
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);
  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly star = STAR;
}
