import { Directive, ElementRef, PLATFORM_ID, afterNextRender, inject, DestroyRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Reveal once on approach; SSR, reduced motion and unsupported browsers stay visible. */
@Directive({ selector: '[appReveal]' })
export class RevealDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroy = inject(DestroyRef);
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    afterNextRender(() => {
      const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (!media || media.matches || !('IntersectionObserver' in window) || this.element.getBoundingClientRect().top < window.innerHeight) return;
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        this.element.classList.remove('reveal-pending');
        this.element.classList.add('reveal-enter');
        observer.disconnect();
      }, { rootMargin: '48px', threshold: 0.05 });
      const show = () => { this.element.classList.remove('reveal-pending'); observer.disconnect(); };
      media.addEventListener('change', show);
      this.element.classList.add('reveal-pending');
      observer.observe(this.element);
      this.destroy.onDestroy(() => { observer.disconnect(); media.removeEventListener('change', show); });
    });
  }
}
