import type { EntityManager } from 'typeorm';
import { Quote } from './quote.entity';
import { QuoteStatus } from './quote.enums';

/**
 * Presupuestos que ocupan lugar en un pedido: aceptados y pendientes vigentes. EXPIRED,
 * REJECTED y WITHDRAWN lo liberan. Única fuente: el presupuesto (tope de lugares) y
 * "Sumar profesionales" (¿hay lugar para más respuestas?) cuentan igual.
 */
export function countActiveQuotes(m: Pick<EntityManager, 'createQueryBuilder'>, requestId: string, now: Date): Promise<number> {
  return m
    .createQueryBuilder(Quote, 'q')
    .where('q.request_id = :requestId', { requestId })
    .andWhere(`(q.status = :accepted OR (q.status = :pending AND (q.valid_until IS NULL OR q.valid_until > :now)))`, {
      accepted: QuoteStatus.ACCEPTED,
      pending: QuoteStatus.PENDING,
      now,
    })
    .getCount();
}
