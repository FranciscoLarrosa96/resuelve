import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { BillingProviderName, BillingSubscriptionStatus } from './billing.enums';

/**
 * Suscripción mensual a Resuelve PRO en un proveedor de cobro (Mercado Pago,
 * preapproval SIN plan asociado: cada una tiene su monto).
 *
 * - `id` se genera en el servidor ANTES de llamar al proveedor y viaja como
 *   `external_reference`: si la creación termina en timeout se puede buscar.
 * - Una sola suscripción abierta (PENDING/ACTIVE/PAST_DUE/PAUSED) por
 *   profesional: índice único parcial en la migración.
 * - El proveedor es la fuente de verdad del cobro; los entitlements se
 *   derivan en `billing-rules.ts` → `professional_profiles.billing_pro_until`.
 */
@Entity('billing_subscriptions')
@Index('UQ_billing_subscriptions_provider_id', ['provider', 'providerSubscriptionId'], { unique: true })
export class BillingSubscription {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  @Column({ type: 'enum', enum: BillingProviderName, enumName: 'billing_provider' })
  provider: BillingProviderName;

  /** id del preapproval (null solo mientras se crea). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  providerSubscriptionId: string | null;

  @Column({
    type: 'enum',
    enum: BillingSubscriptionStatus,
    enumName: 'billing_subscription_status',
    default: BillingSubscriptionStatus.PENDING,
  })
  status: BillingSubscriptionStatus;

  /** Último estado crudo informado por el proveedor (solo diagnóstico). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  providerStatus: string | null;

  /** URL de autorización del proveedor (`init_point`). Nunca se arma a mano. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  checkoutUrl: string | null;

  /** Precio normal al crear (pesos enteros). */
  @Column({ type: 'integer' })
  baseAmount: number;

  /** Monto que el proveedor cobra hoy por ciclo (promo o normal). */
  @Column({ type: 'integer' })
  currentAmount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  /** Oferta aplicada al crear (p. ej. `PRO_FIRST_MONTH_20`); null = precio normal. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  offerCode: string | null;

  /** Ciclos con descuento de la oferta (copiados al crear). */
  @Column({ type: 'smallint', nullable: true })
  offerCycles: number | null;

  /** Primer cobro promocional APROBADO: la oferta quedó consumida. */
  @Column({ type: 'timestamptz', nullable: true })
  offerRedeemedAt: Date | null;

  /** El proveedor confirmó el paso al precio normal. null con oferta redimida = pendiente de reintento. */
  @Column({ type: 'timestamptz', nullable: true })
  offerRegularPriceAppliedAt: Date | null;

  /** Ruta interna a la que volver después de activar (p. ej. `/pro/solicitudes/<id>`). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  returnPath: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  authorizedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pastDueSince: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  /** Tras cancelar: PRO hasta acá (fin del período ya pagado). */
  @Column({ type: 'timestamptz', nullable: true })
  accessUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextPaymentAt: Date | null;

  /** Último cobro aprobado. */
  @Column({ type: 'timestamptz', nullable: true })
  lastPaymentAt: Date | null;

  /** `last_modified` del proveedor en la última sincronización (descarta lecturas viejas). */
  @Column({ type: 'timestamptz', nullable: true })
  providerUpdatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastProviderSyncAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
