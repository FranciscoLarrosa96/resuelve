import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Escenas de las ilustraciones. Cada una acompaña un momento puntual y dice lo
 * mismo que el texto de al lado (nunca un dato que el texto no diga):
 * - `sent`: el pedido sale y lo reciben profesionales (solo con invitaciones confirmadas;
 *   `recipients` dibuja la cantidad real, hasta 3).
 * - `search`: buscamos en la zona y no hay oferta; con `alert`, la campana del "Avisame"
 *   (solo donde ese aviso se ofrece).
 * - `requests`: todavía no hay solicitudes; el "+" invita a empezar una.
 * - `quiet`: sin notificaciones nuevas.
 * - `sprout`: un perfil que recién empieza a moverse (Tu mes sin actividad).
 */
export type IllustrationScene = 'sent' | 'search' | 'requests' | 'quiet' | 'sprout';

/**
 * Ilustración vectorial animada, dibujada en línea con los tokens de marca (se
 * adapta sola a Claro/Oscuro). La animación corre UNA sola vez al aparecer, sin
 * bucles, y es decorativa (aria-hidden): el estado lo dice el texto. Con
 * movimiento reducido queda el dibujo final, quieto. Sin dependencias ni
 * archivos externos.
 */
@Component({
  selector: 'app-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-scene]': 'scene()',
    '[style.width.px]': 'size()',
  },
  template: `
    <svg viewBox="0 0 200 140" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle class="il-bg" cx="100" cy="72" r="58" />
      @switch (scene()) {
        @case ('sent') {
          <path class="il-trail" d="M26 112 C 52 108 70 78 96 62" stroke-dasharray="3 7" />
          <g class="il-team">
            @for (x of team(); track x; let i = $index) {
              <g class="il-pop" [style.--d]="1.15 + i * 0.16 + 's'">
                <path class="il-shape" [attr.d]="'M' + (x - 11) + ' 118 a11 11 0 0 1 22 0'" />
                <circle class="il-shape" [attr.cx]="x" cy="98" r="7" />
              </g>
              <circle
                class="il-dot il-pop"
                [attr.cx]="x + 8"
                cy="90"
                r="3"
                [style.--d]="1.45 + i * 0.16 + 's'"
              />
            }
          </g>
          <g transform="translate(108 52)">
            <g class="il-fly">
              <path class="il-shape" d="M-20 4 L20 -14 L6 16 L-1 6 Z" />
              <path class="il-stroke" d="M-1 6 L20 -14" />
            </g>
          </g>
        }
        @case ('search') {
          <path class="il-ground" d="M30 114 H170" />
          <g class="il-shape">
            <path d="M42 114 V94 L58 81 L74 94 V114" />
            <path d="M126 114 V98 L140 87 L154 98 V114" />
          </g>
          <path class="il-stroke" d="M54 114 v-10 h8 v10 M136 114 v-8 h8 v8" />
          <g transform="translate(100 66)">
            <g class="il-sweep">
              <circle class="il-glass" cx="0" cy="0" r="16" />
              <path class="il-stroke il-thick" d="M11.5 11.5 L22 22" />
            </g>
          </g>
          @if (alert()) {
            <g transform="translate(142 44)">
              <g class="il-pop" style="--d: 1.7s">
                <g class="il-ring">
                  <path
                    class="il-bell-accent"
                    d="M-9 5 C-9 -6 -5 -10 0 -10 C5 -10 9 -6 9 5 L11 8 H-11 Z"
                  />
                  <circle class="il-dot" cx="0" cy="11" r="2.4" />
                </g>
              </g>
            </g>
          }
        }
        @case ('requests') {
          <rect class="il-shape" x="68" y="30" width="64" height="84" rx="9" />
          <rect class="il-clip" x="86" y="24" width="28" height="13" rx="4" />
          @for (l of lines; track l.y; let i = $index) {
            <path
              class="il-text il-draw"
              [attr.d]="'M82 ' + l.y + ' H' + l.end"
              pathLength="1"
              [style.--d]="0.25 + i * 0.18 + 's'"
            />
          }
          <g transform="translate(134 106)">
            <g class="il-pop" style="--d: 0.95s">
              <circle class="il-badge-accent" r="13" />
              <path class="il-on-fill" d="M0 -6 V6 M-6 0 H6" />
            </g>
          </g>
        }
        @case ('quiet') {
          <g transform="translate(100 40)">
            <g class="il-swing">
              <path
                class="il-shape"
                d="M-24 52 C-24 18 -16 8 0 8 C16 8 24 18 24 52 L30 60 H-30 Z"
              />
              <path class="il-stroke" d="M0 8 V2" />
              <path class="il-stroke il-thick" d="M-7 68 a7 7 0 0 0 14 0" />
            </g>
          </g>
          <g transform="translate(128 50)">
            <g class="il-pop" style="--d: 1.1s">
              <circle class="il-badge" r="12" />
              <path class="il-on-fill" d="M-5 0.5 L-1.5 4 L5.5 -3.5" />
            </g>
          </g>
        }
        @case ('sprout') {
          <ellipse class="il-soil" cx="100" cy="114" rx="42" ry="8" />
          <path
            class="il-stroke il-thick il-draw"
            d="M100 114 C100 100 100 88 100 72"
            pathLength="1"
            style="--d: 0.1s"
          />
          <path
            class="il-leaf il-grow il-grow-right"
            d="M100 92 C88 90 78 82 78 70 C92 70 100 78 100 92 Z"
            style="--d: 0.75s"
          />
          <path
            class="il-leaf il-grow il-grow-left"
            d="M100 80 C112 78 124 68 124 54 C108 54 100 64 100 80 Z"
            style="--d: 0.95s"
          />
          <circle class="il-dot il-pop" cx="132" cy="44" r="3" style="--d: 1.35s" />
          <circle class="il-dot il-pop" cx="68" cy="58" r="2.4" style="--d: 1.5s" />
          <circle class="il-spark il-pop" cx="140" cy="62" r="2" style="--d: 1.6s" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      max-width: 100%;
      pointer-events: none;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .il-bg {
      fill: var(--color-brand-tint);
    }
    .il-shape,
    .il-glass,
    .il-clip {
      fill: var(--color-surface);
      stroke: var(--color-brand);
      stroke-width: 2.6;
    }
    .il-glass {
      fill: var(--color-brand-soft);
    }
    .il-clip {
      fill: var(--color-brand-soft);
    }
    .il-stroke {
      stroke: var(--color-brand);
      stroke-width: 2.6;
    }
    .il-thick {
      stroke-width: 4;
    }
    .il-text {
      stroke: var(--color-line);
      stroke-width: 4;
    }
    .il-trail,
    .il-ground {
      stroke: var(--color-brand-line);
      stroke-width: 2.4;
    }
    .il-ground {
      stroke: var(--color-line);
    }
    .il-dot {
      fill: var(--color-accent);
    }
    .il-spark {
      fill: var(--color-brand-line);
    }
    .il-bell-accent {
      fill: var(--color-accent-soft);
      stroke: var(--color-accent);
      stroke-width: 2.4;
    }
    .il-badge {
      fill: var(--color-primary);
    }
    .il-badge-accent {
      fill: var(--color-accent-fill);
    }
    .il-on-fill {
      stroke: #fff;
      stroke-width: 2.6;
    }
    .il-soil {
      fill: var(--color-sand-dark);
    }
    .il-leaf {
      fill: var(--color-brand-soft);
      stroke: var(--color-brand);
      stroke-width: 2.4;
    }

    /* Todo corre una vez, con el estado final como estado de reposo. */
    .il-pop,
    .il-draw,
    .il-grow,
    .il-fly,
    .il-sweep,
    .il-swing,
    .il-ring,
    .il-trail {
      animation-fill-mode: both;
      animation-timing-function: var(--ease-enter, cubic-bezier(0.16, 1, 0.3, 1));
      animation-delay: var(--d, 0s);
      transform-box: fill-box;
    }
    .il-pop {
      transform-origin: center;
      animation-name: il-pop;
      animation-duration: 420ms;
    }
    .il-draw {
      stroke-dasharray: 1;
      animation-name: il-draw;
      animation-duration: 600ms;
    }
    .il-grow {
      animation-name: il-grow;
      animation-duration: 520ms;
    }
    .il-grow-right {
      transform-origin: 100% 100%;
    }
    .il-grow-left {
      transform-origin: 0% 100%;
    }
    .il-trail {
      animation-name: il-fade;
      animation-duration: 700ms;
      animation-delay: 0.2s;
    }
    .il-fly {
      animation-name: il-fly;
      animation-duration: 1.1s;
    }
    .il-sweep {
      transform-origin: center;
      animation-name: il-sweep;
      animation-duration: 1.6s;
      animation-timing-function: ease-in-out;
    }
    .il-ring {
      transform-origin: 50% 0%;
      animation-name: il-ring;
      animation-duration: 900ms;
      animation-delay: 2.1s;
      animation-timing-function: ease-out;
    }
    .il-swing {
      transform-origin: 50% 0%;
      animation-name: il-ring;
      animation-duration: 1s;
      animation-delay: 0.25s;
      animation-timing-function: ease-out;
    }

    @keyframes il-pop {
      from {
        opacity: 0;
        transform: scale(0.4);
      }
      60% {
        opacity: 1;
        transform: scale(1.08);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    @keyframes il-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes il-grow {
      from {
        opacity: 0;
        transform: scale(0.2);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    @keyframes il-fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes il-fly {
      from {
        opacity: 0;
        transform: translate(-78px, 58px) rotate(14deg) scale(0.7);
      }
      25% {
        opacity: 1;
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes il-sweep {
      0% {
        transform: translateX(0);
      }
      30% {
        transform: translateX(-34px);
      }
      70% {
        transform: translateX(34px);
      }
      100% {
        transform: translateX(0);
      }
    }
    @keyframes il-ring {
      0% {
        transform: rotate(0);
      }
      20% {
        transform: rotate(14deg);
      }
      45% {
        transform: rotate(-10deg);
      }
      70% {
        transform: rotate(5deg);
      }
      100% {
        transform: rotate(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
      }
    }
  `,
})
export class Illustration {
  readonly scene = input.required<IllustrationScene>();
  /** Ancho en px; el alto sale de la proporción del dibujo (10:7). */
  readonly size = input(168);
  /** Escena `search`: suma la campana solo si la pantalla ofrece "Avisame cuando haya". */
  readonly alert = input(false);

  /** Escena `sent`: cuántos profesionales recibieron el pedido (se dibujan hasta 3). */
  readonly recipients = input(1);

  /** Siempre la cantidad real (1 a 3), centrada bajo el avión. */
  protected readonly team = computed(() => {
    const n = Math.min(3, Math.max(1, Math.floor(this.recipients())));
    return [[150], [137, 163], [124, 150, 176]][n - 1];
  });
  protected readonly lines = [
    { y: 56, end: 118 },
    { y: 72, end: 112 },
    { y: 88, end: 100 },
  ];
}
