import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Badge "PRO": el profesional tiene una suscripción Resuelve PRO vigente.
 * NO significa mejor profesional, verificado, recomendado ni matriculado:
 * matrícula y reputación se muestran aparte. Solo si el backend manda `pro: true`.
 */
@Component({
  selector: 'app-pro-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-flex shrink-0 items-center rounded-md border border-brand px-1.5 py-px text-[10.5px] leading-4 font-bold tracking-[0.08em] text-brand',
    title: 'Tiene Resuelve PRO (suscripción paga). No es una verificación ni una recomendación.',
  },
  template: `<span aria-hidden="true">PRO</span><span class="sr-only">Resuelve PRO</span>`,
})
export class ProBadge {}

/**
 * Rótulo de un espacio destacado pago en resultados. Siempre visible cuando
 * el backend marca `isFeaturedPlacement`: el pago nunca pasa por mérito orgánico.
 */
@Component({
  selector: 'app-featured-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.1em] text-muted uppercase',
    title: 'Espacio destacado para profesionales con Resuelve PRO que cumplen las mismas reglas que el resto.',
  },
  template: `<span class="size-1.5 rounded-full bg-brand" aria-hidden="true"></span>Destacado<span class="sr-only">: espacio promocionado (Resuelve PRO)</span>`,
})
export class FeaturedLabel {}
