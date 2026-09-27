import { Signal, computed, inject } from '@angular/core';
import { NotificationsStore } from './notifications.store';
import { ProRequestsStore } from './pro-requests.store';

/**
 * Lo REAL que espera en modo profesional mientras la persona está en modo
 * cliente: novedades de Solicitudes y de la Agenda, y trabajos por cerrar. Solo
 * con ProfessionalProfile. Nunca se suma a "Mis solicitudes".
 * Llamar en un contexto de inyección (constructor o inicializador de campo).
 */
export function proModeBadge(): Signal<number> {
  const reqs = inject(ProRequestsStore);
  const notifications = inject(NotificationsStore);
  return computed(() =>
    reqs.hasProfile()
      ? notifications.proTotal()
      : 0,
  );
}
