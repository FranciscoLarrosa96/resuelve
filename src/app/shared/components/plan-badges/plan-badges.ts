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
      'inline-flex shrink-0 items-center rounded-md bg-brand-soft px-1.5 py-px text-[12px] leading-4 font-bold tracking-[0.08em] text-brand-dark',
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
    class:
      'inline-flex flex-wrap items-center gap-x-1.5 text-[14px] leading-5 font-semibold tracking-[0.06em] text-brand-dark',
    title:
      'Espacio destacado para profesionales con Resuelve PRO que cumplen las mismas reglas que el resto.',
  },
  template: `<span>Destacado PRO · Espacio promocionado (pago)</span>`,
})
export class FeaturedLabel {}
