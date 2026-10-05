import { Throttle } from '@nestjs/throttler';

/**
 * Límites por IP y por minuto para acciones de escritura (el global de 120/min cubre las lecturas).
 * Dos escalones: crear algo que llega a otra persona (solicitud, presupuesto, reseña) y el resto de
 * escrituras livianas (guardar favorito, invitar, pedir PRO). Configurables por entorno.
 */
export const CREATE_LIMIT = Number(process.env.THROTTLE_CREATE_LIMIT ?? 12);
export const WRITE_LIMIT = Number(process.env.THROTTLE_WRITE_LIMIT ?? 30);

export const ThrottleCreate = () => Throttle({ default: { limit: CREATE_LIMIT, ttl: 60_000 } });
export const ThrottleWrite = () => Throttle({ default: { limit: WRITE_LIMIT, ttl: 60_000 } });
