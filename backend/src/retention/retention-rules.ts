import { isPublicProfile } from '../professionals/professional-rules';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';

/**
 * Cómo se ve un profesional ya contratado o guardado:
 * - AVAILABLE: recibe solicitudes (perfil activo y al menos un servicio que puede ofrecer hoy).
 * - PAUSED: lo pausó él ("No está recibiendo nuevas solicitudes por ahora"). Conserva el historial.
 * - UNAVAILABLE: activo pero sin ningún servicio público (p. ej. matrícula vencida): "Perfil no disponible actualmente".
 * Las acciones (Volver a contratar, Pedir presupuesto) solo existen en AVAILABLE; el historial se ve siempre.
 * El backend vuelve a validar al enviar (`requestIneligibility`): esto solo decide qué se ofrece.
 */
export type RetentionAvailability = 'AVAILABLE' | 'PAUSED' | 'UNAVAILABLE';

export function retentionAvailability(
  profile: Pick<ProfessionalProfile, 'status'>,
  publicServiceCount: number,
): RetentionAvailability {
  if (!isPublicProfile(profile)) return 'PAUSED';
  return publicServiceCount > 0 ? 'AVAILABLE' : 'UNAVAILABLE';
}

/** Servicio sugerido al volver a contratar: el del último trabajo, solo si hoy lo sigue ofreciendo. Nunca se asume que el pedido es igual. */
export function rehireServiceId(
  lastServiceId: string | null,
  publicServiceIds: readonly string[],
): string | null {
  return lastServiceId && publicServiceIds.includes(lastServiceId) ? lastServiceId : null;
}
