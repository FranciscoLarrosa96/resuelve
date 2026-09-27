import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BillingProviderName } from './billing.enums';

/**
 * Registro de notificaciones del proveedor ya procesadas (auditoría +
 * idempotencia). La misma entrega (`x-request-id`) se procesa una vez; una
 * notificación NUEVA del mismo recurso sí se procesa (puede traer un estado
 * nuevo). Nunca guarda el body ni la firma.
 */
@Entity('billing_webhook_events')
@Index('UQ_billing_webhook_events_delivery', ['provider', 'topic', 'providerResourceId', 'requestId'], {
  unique: true,
})
export class BillingWebhookEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: BillingProviderName, enumName: 'billing_provider' })
  provider: BillingProviderName;

  @Column({ type: 'varchar', length: 60 })
  topic: string;

  @Column({ type: 'varchar', length: 64 })
  providerResourceId: string;

  /** `x-request-id` de la entrega ('' si no vino). */
  @Column({ type: 'varchar', length: 100, default: '' })
  requestId: string;

  /** `ts` de la firma (segundos). */
  @Column({ type: 'bigint', nullable: true })
  signatureTimestamp: string | null;

  /** PROCESSED | IGNORED | ERROR (se reintenta: la fila se actualiza). */
  @Column({ type: 'varchar', length: 20 })
  result: string;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
