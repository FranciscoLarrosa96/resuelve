import { createHash } from 'node:crypto';
import { ExposureEventType } from './exposure-event.entity';

/** Una visita al perfil por profesional + sesión cada 30 minutos (bloques fijos). */
export const PROFILE_VIEW_WINDOW_MS = 30 * 60 * 1000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface ExposureContext {
  type: ExposureEventType;
  professionalId: string;
  serviceId: string | null;
  zoneId: string | null;
  isUrgent: boolean | null;
  page: number | null;
}

/**
 * Clave de deduplicación (única en la base):
 * - aparición: una por profesional + contexto de búsqueda + sesión + página;
 * - visita al perfil: una por profesional + sesión + ventana de 30 min.
 */
export function exposureDedupeKey(e: ExposureContext, sessionKeyHash: string, now = new Date()): string {
  if (e.type === ExposureEventType.PROFILE_VIEW) {
    const window = Math.floor(now.getTime() / PROFILE_VIEW_WINDOW_MS);
    return sha256(['view', e.professionalId, sessionKeyHash, window].join('|'));
  }
  return sha256(
    [
      'imp',
      e.professionalId,
      sessionKeyHash,
      e.serviceId ?? '',
      e.zoneId ?? '',
      e.isUrgent ?? '',
      e.page ?? 1,
    ].join('|'),
  );
}

/**
 * Tasa de conversión entre dos pasos del embudo, en % con un decimal. null
 * (la UI muestra "—") sin denominador o si el paso siguiente supera al
 * anterior: se puede pedir presupuesto desde la tarjeta sin abrir el perfil, o
 * abrir un perfil desde un link directo, y un "1300 %" no dice nada útil.
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0 || numerator > denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
