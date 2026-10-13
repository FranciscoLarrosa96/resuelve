import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
      <ul class="grid grid-cols-3 gap-2" [attr.aria-label]="label()" data-testid="work-covers">
        @for (w of covers().slice(0, 3); track w.url) {
          <li class="relative min-w-0">
            <img
              [src]="w.url"
              [alt]="w.title"
              loading="lazy"
              decoding="async"
              class="aspect-[4/3] w-full rounded-lg border border-line-soft bg-sand object-cover"
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
}
