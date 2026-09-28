import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Mapa simulado (sin API de mapas todavía).
 * Los pines y overlays se proyectan como contenido y se posicionan en %.
 */
@Component({
  selector: 'app-map-mock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block overflow-hidden border border-line-input bg-map-land' },
  template: `
    <div class="map-streets pointer-events-none absolute -inset-1/4 -rotate-[14deg]" aria-hidden="true"></div>
    @if (detailed()) {
      <div aria-hidden="true" class="pointer-events-none">
        <div class="absolute -inset-x-[10%] top-[46%] h-3 rotate-[20deg] bg-map-road shadow-[0_0_0_1px_var(--color-map-road-edge)]"></div>
        <div class="absolute top-[8%] left-[6%] h-[20%] w-[30%] rounded-[40%_60%_50%_50%] bg-map-park"></div>
        <div class="absolute top-[15%] left-[9%] text-[10.5px] font-semibold tracking-[0.04em] text-map-park-ink uppercase">Parque Independencia</div>
        <div class="absolute right-[4%] bottom-[6%] h-[17%] w-[32%] rounded-[50%] bg-map-water"></div>
        <div class="absolute right-[9%] bottom-[12%] text-[10.5px] font-semibold tracking-[0.04em] text-map-water-ink uppercase">Lago del Fuerte</div>
      </div>
    }
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed"
      [style.left.%]="50"
      [style.top.%]="centerY()"
      [style.width.px]="radius()"
      [style.height.px]="radius()"
      [class]="detailed() ? 'border-brand/45 bg-brand/8' : 'border-brand/50 bg-brand/12'"
    ></div>
    @if (detailed()) {
      <div
        aria-hidden="true"
        class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-map-pin shadow-[0_2px_6px_rgba(0,0,0,.25)]"
        [style.left.%]="50"
        [style.top.%]="centerY()"
      ></div>
    }
    <ng-content />
  `,
})
export class MapMock {
  /** Mapa de resultados (parque, lago, ruta) vs. mapa chico de zona. */
  readonly detailed = input(true);
  readonly radius = input(200);
  readonly centerY = input(60);
}
