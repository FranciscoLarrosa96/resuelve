import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/**
 * Ejecuta `callback` cuando el usuario vuelve a la pestaña (sin polling).
 * Como mucho una vez cada `minIntervalMs`. Debe llamarse en un contexto de inyección.
 */
export function onTabVisible(callback: () => void, minIntervalMs = 30_000): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const doc = inject(DOCUMENT);
  let last = Date.now();
  const listener = () => {
    if (doc.visibilityState !== 'visible' || Date.now() - last < minIntervalMs) return;
    last = Date.now();
    callback();
  };
  doc.addEventListener('visibilitychange', listener);
  inject(DestroyRef).onDestroy(() => doc.removeEventListener('visibilitychange', listener));
}
