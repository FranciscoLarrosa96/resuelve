import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Un hecho del recorrido de un pedido (ver `request-journey.ts`). Sin datos
 * personales: clave aleatoria del intento, tipo, paso, recorrido y, en SENT, el id
 * interno de la solicitud. `dedupeKey` único: recargas, vueltas atrás y
 * reintentos no suman.
 */
@Entity('request_journey_events')
@Index('IDX_request_journey_events_attempt', ['attemptId'])
@Index('IDX_request_journey_events_type_occurred', ['type', 'occurredAt'])
export class RequestJourneyEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column('uuid')
  attemptId: string;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  /** Recorrido del intento (null en SENT: lo escribe el servidor y lo toma de los eventos del navegador). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  journey: string | null;

  @Column({ type: 'smallint', nullable: true })
  step: number | null;

  /** Cómo llegó (atribución de entrada del pedido). Solo en STARTED. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  entry: string | null;

  /** Solo SENT: la solicitud que quedó enviada (id interno). */
  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'varchar', length: 80, unique: true })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
