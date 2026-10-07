import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * Momento de celebración: un check que aparece con un anillo y ocho puntos que
 * se abren una sola vez. Solo se monta como respuesta a una acción del usuario
 * (aceptar un presupuesto, cerrar un trabajo) o de un premio que llega (el
 * festejo de referidos, una sola vez), nunca al abrir una página sin motivo.
 * Decorativo (aria-hidden): el estado lo dice el texto de al lado.
 * Movimiento reducido: queda el check con un fundido, sin anillo ni puntos.
 */
@Component({
  selector: 'app-celebrate',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <span class="celebrate-ring"></span>
    @for (d of dots; track d) {
      <span class="celebrate-dot" [style.--a.deg]="d * 45" [class.celebrate-dot-accent]="d % 2 === 1"></span>
    }
    <span class="celebrate-core"><app-icon name="check" [size]="30" [stroke]="3" /></span>
  `,
  styles: `
    :host {
      position: relative;
      /* Decorativo: el anillo y los puntos crecen fuera de la caja y no deben tapar botones. */
      pointer-events: none;
      display: inline-grid;
      place-items: center;
      width: 64px;
      height: 64px;
      flex: none;
    }
    .celebrate-core {
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 9999px;
      background: var(--color-primary);
      color: var(--color-on-primary);
      animation: celebrate-core 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .celebrate-ring {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      border: 3px solid var(--color-brand);
      animation: celebrate-ring 900ms var(--ease-out-soft) 120ms both;
    }
    .celebrate-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 9px;
      height: 9px;
      margin: -4.5px 0 0 -4.5px;
      border-radius: 9999px;
      background: var(--color-brand);
      animation: celebrate-dot 850ms var(--ease-out-soft) 160ms both;
    }
    .celebrate-dot-accent {
      background: var(--color-accent);
    }
    @keyframes celebrate-core {
      from {
        transform: scale(0.3);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    @keyframes celebrate-ring {
      from {
        transform: scale(1);
        opacity: 0.8;
      }
      to {
        transform: scale(2.6);
        opacity: 0;
      }
    }
    @keyframes celebrate-dot {
      from {
        transform: rotate(var(--a)) translateY(-30px) scale(0.8);
        opacity: 1;
      }
      to {
        transform: rotate(var(--a)) translateY(-72px) scale(0.2);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .celebrate-ring,
      .celebrate-dot {
        display: none;
      }
      .celebrate-core {
        animation: celebrate-fade 200ms ease-out both;
      }
      @keyframes celebrate-fade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    }
  `,
})
export class Celebrate {
  protected readonly dots = [0, 1, 2, 3, 4, 5, 6, 7];
}
