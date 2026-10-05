import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { BillingPaymentStatus } from './billing.enums';
import { BillingSubscription } from './billing-subscription.entity';

/**
 * Cobro recurrente de una suscripción (authorized payment / invoice de
 * Mercado Pago). Snapshot mínimo: nunca datos de tarjeta. Unique por id del
 * proveedor: un webhook repetido actualiza la misma fila.
 */
@Entity('billing_payments')
@Unique('UQ_billing_payments_authorized_payment', ['providerAuthorizedPaymentId'])
export class BillingPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  billingSubscriptionId: string;

  @ManyToOne(() => BillingSubscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'billing_subscription_id' })
  subscription?: BillingSubscription;

  @Column({ type: 'varchar', length: 64 })
  providerAuthorizedPaymentId: string;

  /** id del pago asociado (cuando el proveedor ya intentó cobrar). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  providerPaymentId: string | null;

  @Column({ type: 'integer' })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: BillingPaymentStatus, enumName: 'billing_payment_status' })
  status: BillingPaymentStatus;

  /** Detalle del proveedor (p. ej. `cc_rejected_insufficient_amount`). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  statusDetail: string | null;

  @Column({ type: 'smallint', nullable: true })
  retryAttempt: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  debitDate: Date | null;

  /** Reembolso (arrepentimiento) confirmado por el proveedor. */
  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  providerRefundId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  providerUpdatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
