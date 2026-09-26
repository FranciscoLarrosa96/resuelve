import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input, untracked } from '@angular/core';
import { ExposureTracker, ImpressionContext, impressionKey } from './exposure-tracker';

/** Visible = al menos la mitad de la tarjeta durante medio segundo. */
export const IMPRESSION_THRESHOLD = 0.5;
export const IMPRESSION_DWELL_MS = 500;

/**
 * Cuenta una aparición cuando la tarjeta REALMENTE se vio (IntersectionObserver,
 * ≥ 50 % durante ≥ 500 ms). Un rerender o change detection no suma: el
 * observador se arma una vez por contexto de búsqueda y se desconecta al contar.
 * Sin IntersectionObserver (SSR, tests) no hace nada.
 */
@Directive({ selector: '[appTrackImpression]' })
export class TrackImpression {
  readonly context = input.required<ImpressionContext>({ alias: 'appTrackImpression' });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tracker = inject(ExposureTracker);
  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private observedKey: string | null = null;

  constructor() {
    afterNextRender(() => {
      this.ready = true;
      this.observe();
    });
    // Mismo profesional en otra búsqueda (la tarjeta se reutiliza): es otra aparición.
    effect(() => {
      impressionKey(this.context());
      untracked(() => this.observe());
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private observe(): void {
    if (!this.ready || typeof IntersectionObserver === 'undefined') return;
    const key = impressionKey(this.context());
    if (key === this.observedKey) return;
    this.stop();
    this.observedKey = key;
    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= IMPRESSION_THRESHOLD) {
          this.timer ??= setTimeout(() => {
            this.tracker.impression(this.context());
            this.stop();
          }, IMPRESSION_DWELL_MS);
        } else if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      },
      { threshold: [0, IMPRESSION_THRESHOLD, 1] },
    );
    this.observer.observe(this.el.nativeElement);
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.observer?.disconnect();
    this.observer = null;
  }
}
