/**
 * Baja de cuenta: reglas puras (sin base ni HTTP).
 *
 * La baja ANONIMIZA, no borra: todas las claves hacia `users` son
 * ON DELETE CASCADE, así que un DELETE se llevaría los trabajos, reseñas y
 * solicitudes de otras personas. La fila queda (sin datos personales) para que
 * el historial de la contraparte siga siendo coherente: "Usuario eliminado".
 */

export const DELETED_FIRST_NAME = 'Usuario';
export const DELETED_LAST_NAME = 'eliminado';
export const DELETED_REQUEST_DESCRIPTION = 'La persona que hizo esta solicitud eliminó su cuenta.';

/** Único e inutilizable para ingresar (dominio reservado `.invalid`). */
export const deletedEmail = (userId: string): string => `eliminado-${userId}@eliminado.invalid`;
export const deletedSlug = (profileId: string): string => `profesional-eliminado-${profileId.slice(0, 8)}`;

/** Por qué todavía no se puede dar de baja la cuenta. */
export enum DeletionBlocker {
  /** Trabajo en curso (profesional elegido o agendado) como cliente o como profesional. */
  ACTIVE_JOBS = 'ACTIVE_JOBS',
  /** Suscripción PRO viva (pendiente, activa, en mora o pausada): se cancela antes en "Mi plan". */
  OPEN_SUBSCRIPTION = 'OPEN_SUBSCRIPTION',
}

export interface DeletionBlock {
  code: DeletionBlocker;
  count: number;
  message: string;
}

export interface DeletionCounts {
  activeJobs: number;
  openSubscriptions: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function deletionBlockers(c: DeletionCounts): DeletionBlock[] {
  const blocks: DeletionBlock[] = [];
  if (c.activeJobs > 0) {
    blocks.push({
      code: DeletionBlocker.ACTIVE_JOBS,
      count: c.activeJobs,
      message: `Tenés ${c.activeJobs} ${plural(c.activeJobs, 'trabajo en curso', 'trabajos en curso')} con otra persona. Terminalo o cancelalo antes de eliminar tu cuenta.`,
    });
  }
  if (c.openSubscriptions > 0) {
    blocks.push({
      code: DeletionBlocker.OPEN_SUBSCRIPTION,
      count: c.openSubscriptions,
      message: 'Tenés una suscripción a Resuelve PRO. Cancelala en "Mi plan" antes de eliminar tu cuenta.',
    });
  }
  return blocks;
}

/** Solicitudes del cliente que se cancelan solas al darse de baja (todavía sin profesional elegido). */
export const AUTO_CANCELLED_REQUEST_STATUSES = ['DRAFT', 'WAITING_QUOTES', 'QUOTES_RECEIVED'] as const;
/** Solicitudes/trabajos con una contraparte esperando: bloquean la baja. */
export const ACTIVE_REQUEST_STATUSES = ['PROFESSIONAL_SELECTED', 'SCHEDULED'] as const;
export const ACTIVE_JOB_STATUSES = ['TO_COORDINATE', 'SCHEDULED', 'IN_PROGRESS'] as const;
