import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Portada de un trabajo realizado (la primera foto del trabajo). */
export interface WorkCoverItem {
  title: string;
  url: string;
}

/**
 * Tira de portadas de trabajos realizados (hasta 3): la única forma de mostrarlas en
 * tarjetas de resultados, Destacados y presupuestos. El backend solo las manda para un
 * PRO vigente (presentación de PRO). `example` = fotos de muestra (`public/portfolio-demo/`)
 * en la venta de PRO: cada una va rotulada "Ejemplo" y nunca se mezcla con contenido real.
 */
@Component({
  selector: 'app-work-covers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (covers().length) {
      <ul
        class="grid gap-2"
        [style.grid-template-columns]="'repeat(' + shown().length + ', minmax(0, 1fr))'"
        [attr.aria-label]="label()"
        data-testid="work-covers"
      >
        @for (w of shown(); track w.url) {
          <li class="relative min-w-0">
            <!-- Una sola foto ocupa todo el ancho (apaisada y con alto tope); dos o tres, en partes iguales. -->
            <img
              [src]="w.url"
              [alt]="w.title"
              loading="lazy"
              decoding="async"
              class="w-full rounded-lg border border-line-soft bg-sand object-cover"
              [class]="shown().length === 1 ? 'aspect-[16/9] max-h-60' : 'aspect-[4/3]'"
            />
            @if (example()) {
              <span
                class="absolute top-1.5 left-1.5 rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold text-ink"
                >Ejemplo</span
              >
            }
          </li>
        }
      </ul>
    }
  `,
})
export class WorkCovers {
  readonly covers = input.required<readonly WorkCoverItem[]>();
  readonly example = input(false);
  readonly label = input('Trabajos realizados');
  protected readonly shown = computed(() => this.covers().slice(0, 3));
}
