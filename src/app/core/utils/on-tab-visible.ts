import { DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RETRY_EVENT } from '../pwa/network-status';

/**
 * Ejecuta `callback` cuando el usuario vuelve a la pestaña (sin polling).
 * Como mucho una vez cada `minIntervalMs`. También al recuperar la conexión
 * (evento `online`) y al tocar "Reintentar" en "Sin conexión": en esos casos
 * sin esperar el intervalo. Debe llamarse en un contexto de inyección.
 */
export function onTabVisible(callback: () => void, minIntervalMs = 30_000): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  const doc = inject(DOCUMENT);
  const win = doc.defaultView;
  let last = Date.now();
  const listener = () => {
    if (doc.visibilityState !== 'visible' || Date.now() - last < minIntervalMs) return;
    last = Date.now();
    callback();
  };
  const reconnect = () => {
    last = Date.now();
    callback();
  };
  doc.addEventListener('visibilitychange', listener);
  doc.addEventListener(RETRY_EVENT, reconnect);
  win?.addEventListener('online', reconnect);
  inject(DestroyRef).onDestroy(() => {
    doc.removeEventListener('visibilitychange', listener);
    doc.removeEventListener(RETRY_EVENT, reconnect);
    win?.removeEventListener('online', reconnect);
  });
}
