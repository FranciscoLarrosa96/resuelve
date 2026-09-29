import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type GeolocationFailure = 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export class GeolocationError extends Error {
  constructor(readonly reason: GeolocationFailure) {
    super(reason);
  }
}

/** Timeout de "Usar mi ubicación": si el navegador no responde, se sigue a mano. */
export const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * `navigator.geolocation` envuelto: una lectura por pedido (sin seguimiento),
 * precisión normal y errores tipados. Este servicio no persiste; solo el
 * flujo de solicitud guarda el punto si el cliente lo confirma.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  get supported(): boolean {
    return this.isBrowser && typeof navigator !== 'undefined' && !!navigator.geolocation;
  }

  current(): Promise<{ lat: number; lng: number }> {
    if (!this.supported) return Promise.reject(new GeolocationError('unsupported'));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) =>
          reject(
            new GeolocationError(
              err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
            ),
          ),
        { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 },
      );
    });
  }
}
