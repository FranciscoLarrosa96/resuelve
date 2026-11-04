import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TRUST_POINTS } from '../../../core/data/catalog.data';

type Phase = 'still' | 'armed' | 'play';

/**
 * "Personas reales. Decisiones con confianza.": los cuatro pasos con su regla.
 * Al entrar en pantalla, la línea punteada se dibuja de izquierda a derecha y
 * cada ícono hace UNA vez el gesto de su regla cuando la línea le llega:
 * la burbuja "escribe", el escudo se completa con el check, el candado se
 * cierra y la estrella se llena. Pasar el mouse o tocar un paso lo repite (la
 * única repetición, y la provoca la persona). Sin bucles.
 *
 * Decorativo: los íconos son aria-hidden y el texto no cambia. SSR, movimiento
 * reducido o navegadores sin IntersectionObserver: se ve el estado final, quieto.
 */
@Component({
  selector: 'app-trust-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-phase]': 'phase()' },
  template: `
    <div class="ts-wrap">
      <span class="confidence-line" aria-hidden="true"></span>
      <ol class="confidence-steps">
        @for (point of points; track point.title; let i = $index) {
          <li [style.--d]="delays[i] + 's'" (pointerenter)="replay(i)">
            <span class="confidence-dot" aria-hidden="true">
              <!-- Cada repetición vuelve a crear el dibujo: así la animación arranca de cero. -->
              @for (run of [runs()[i]]; track run) {
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  [attr.data-icon]="point.icon"
                >
                  @switch (point.icon) {
                    @case ('chat') {
                      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
                      @for (x of [8.5, 12, 15.5]; track x; let j = $index) {
                        <circle class="ts-typing" [attr.cx]="x" cy="12" r="1" [style.--j]="j" />
                      }
                    }
                    @case ('shield') {
                      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                      <path class="ts-check" d="M8.5 12l2.5 2.5 4.5-5" pathLength="1" />
                    }
                    @case ('lock') {
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path class="ts-shackle" d="M8 11V7a4 4 0 0 1 8 0v4" />
                    }
                    @case ('star') {
                      <path
                        class="ts-star"
                        d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"
                      />
                    }
                  }
                </svg>
              }
            </span>
            <div>
              <p class="confidence-when">{{ point.when }}</p>
              <h3>{{ point.longTitle }}</h3>
              <p class="confidence-text">{{ point.longText }}</p>
            </div>
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ts-wrap {
      position: relative;
      margin-top: 40px;
    }
    .confidence-steps {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      position: relative;
    }
    .confidence-line {
      position: absolute;
      inset: 22px 22px auto;
      border-top: 2px dashed var(--color-brand-line);
    }
    li {
      position: relative;
      padding-right: 28px;
    }
    .confidence-dot {
      position: relative;
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: var(--color-surface);
      border: 2px solid var(--color-brand);
      color: var(--color-brand);
    }
    svg {
      overflow: visible;
    }
    .confidence-when {
      margin: 20px 0 6px;
      font: 500 12px/1.3 var(--font-sans);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-accent-strong);
    }
    h3 {
      font: 600 18px/1.3 var(--font-sans);
    }
    .confidence-text {
      margin-top: 6px;
      font-size: 16px;
      line-height: 1.5;
      color: var(--color-muted);
    }

    /* Estado final (reposo, SSR y movimiento reducido). */
    .ts-typing {
      fill: currentColor;
      stroke: none;
    }
    .ts-check {
      stroke-dasharray: 1;
    }
    .ts-star {
      fill: var(--color-brand-soft);
    }
    .ts-shackle,
    .ts-typing,
    .ts-star {
      transform-box: fill-box;
    }

    /* Antes de entrar en pantalla: la línea sin dibujar y los íconos en su punto de partida. */
    :host([data-phase='armed']) .confidence-line {
      clip-path: inset(0 100% 0 0);
    }
    :host([data-phase='armed']) .confidence-dot {
      transform: scale(0.85);
      opacity: 0.6;
    }

    :host([data-phase='play']) .confidence-line {
      animation: ts-line 1.6s cubic-bezier(0.45, 0, 0.25, 1) both;
    }
    :host([data-phase='play']) .confidence-dot {
      animation: ts-dot 420ms var(--ease-enter, cubic-bezier(0.16, 1, 0.3, 1)) both;
      animation-delay: var(--d);
    }
    /* Los gestos corren al entrar en pantalla ('play') y en cada repetición (dibujo nuevo). */
    :host([data-phase='play']) .ts-typing,
    li.ts-replay .ts-typing {
      animation: ts-typing 520ms ease-in-out both;
      animation-delay: calc(var(--d) + 0.25s + var(--j) * 0.12s);
      transform-origin: center;
    }
    :host([data-phase='play']) .ts-check,
    li.ts-replay .ts-check {
      animation: ts-draw 480ms var(--ease-enter, ease-out) both;
      animation-delay: calc(var(--d) + 0.2s);
    }
    :host([data-phase='play']) .ts-shackle,
    li.ts-replay .ts-shackle {
      animation: ts-close 520ms cubic-bezier(0.3, 1.4, 0.5, 1) both;
      animation-delay: calc(var(--d) + 0.2s);
    }
    :host([data-phase='play']) .ts-star,
    li.ts-replay .ts-star {
      animation: ts-fill 560ms var(--ease-enter, ease-out) both;
      animation-delay: calc(var(--d) + 0.2s);
      transform-origin: center;
    }
    /* Una repetición pedida por la persona corre sin esperar a la línea. */
    li.ts-replay {
      --d: 0s !important;
    }

    @keyframes ts-line {
      /* Se revela (sin estirar los guiones). */
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
    @keyframes ts-dot {
      from {
        transform: scale(0.85);
        opacity: 0.6;
      }
      60% {
        transform: scale(1.08);
        opacity: 1;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    @keyframes ts-typing {
      0%,
      100% {
        transform: translateY(0);
      }
      45% {
        transform: translateY(-2.2px);
      }
    }
    @keyframes ts-draw {
      from {
        stroke-dashoffset: 1;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes ts-close {
      from {
        transform: translateY(-3.5px);
      }
      to {
        transform: none;
      }
    }
    @keyframes ts-fill {
      from {
        fill: transparent;
        transform: scale(1);
      }
      55% {
        transform: scale(1.18);
      }
      to {
        fill: var(--color-brand-soft);
        transform: scale(1);
      }
    }

    @media (max-width: 1023px) {
      .confidence-steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 36px;
      }
      .confidence-line {
        display: none;
      }
    }
    @media (max-width: 639px) {
      .confidence-steps {
        grid-template-columns: 1fr;
        row-gap: 28px;
      }
      li {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        gap: 16px;
        padding-right: 0;
      }
      .confidence-when {
        margin-top: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transform: none !important;
        opacity: 1 !important;
      }
    }
  `,
})
export class TrustSteps {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly points = TRUST_POINTS;
  /** Cuándo le llega la línea a cada ícono (la línea tarda 1,6 s de punta a punta). */
  protected readonly delays = [0.1, 0.6, 1.1, 1.6];
  protected readonly phase = signal<Phase>('still');
  protected readonly runs = signal(TRUST_POINTS.map(() => 0));
  private reduced = false;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.reduced = !!media?.matches;
      if (!media || this.reduced || !('IntersectionObserver' in window)) return;
      // Fuera de pantalla queda "armado" (sin que se note); al entrar, se dibuja una vez.
      this.phase.set('armed');
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          this.phase.set('play');
          observer.disconnect();
        },
        { threshold: 0.35 },
      );
      observer.observe(this.host);
      destroy.onDestroy(() => observer.disconnect());
    });
  }

  /** Repite el gesto de un paso (mouse o toque). Nunca antes de la primera vez ni con movimiento reducido. */
  protected replay(i: number): void {
    if (this.reduced || this.phase() === 'armed') return;
    const li = this.host.querySelectorAll('li')[i];
    li?.classList.add('ts-replay');
    this.runs.update((r) => r.map((n, j) => (j === i ? n + 1 : n)));
  }
}
