import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ExposureTracker } from '../analytics/exposure-tracker';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { ContactChannel, ContactReveal } from '../models/professional';

/**
 * Contacto directo con un profesional (WhatsApp o llamada). Única fuente: tarjetas de
 * búsqueda, urgencias y perfil usan este servicio a través de `app-contact-actions`.
 *
 * El número no viaja en listados: se pide al tocar el botón (el backend lo entrega con
 * límite y registra el clic anónimo con la clave de sesión de `ExposureTracker`). Se
 * guarda en memoria para no pedirlo dos veces. Tocar WhatsApp o Llamar NO crea una
 * solicitud ni nada en Resuelve: la conversación sigue por fuera.
 */
@Injectable({ providedIn: 'root' })
export class DirectContact {
  private readonly api = inject(ProfessionalsApiService);
  private readonly exposure = inject(ExposureTracker);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cache = new Map<string, ContactReveal>();

  /** Ya lo pidió en esta pestaña (para abrir sin esperar). */
  cached(professionalId: string, channel: ContactChannel): ContactReveal | null {
    return this.cache.get(`${professionalId}|${channel}`) ?? null;
  }

  async reveal(professionalId: string, channel: ContactChannel): Promise<ContactReveal> {
    const hit = this.cached(professionalId, channel);
    if (hit) return hit;
    const contact = await firstValueFrom(
      this.api.revealContact(professionalId, channel, this.browser ? this.exposure.attributionSessionKey() : undefined),
    );
    this.cache.set(`${professionalId}|${channel}`, contact);
    return contact;
  }

  /** Pantalla táctil (celular o tablet): "Llamar" marca directo; con mouse se muestra el número. */
  canDial(): boolean {
    return this.browser && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }
}
