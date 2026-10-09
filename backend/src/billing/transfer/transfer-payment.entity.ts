import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';

/**
 * Estado de un pago de PRO por transferencia:
 * - AWAITING_PROOF: el profesional eligió el período y recibió los datos y el código; falta el comprobante.
 * - IN_REVIEW: subió el comprobante; espera que un admin lo confirme.
 * - APPROVED: confirmado; da PRO de `period_start` a `period_end`.
 * - REJECTED: el admin no encontró el pago (con motivo).
 * - CANCELLED: el profesional lo descartó antes de mandar el comprobante (o eligió otro período).
 * - WITHDRAWN: se arrepintió dentro de la ventana legal; PRO se quitó y falta/ya se hizo la devolución.
 */
export enum TransferPaymentStatus {
  AWAITING_PROOF = 'AWAITING_PROOF',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  WITHDRAWN = 'WITHDRAWN',
}

/** Estados que ocupan el único pedido abierto por profesional (índice único parcial). */
export const OPEN_TRANSFER_STATUSES = [TransferPaymentStatus.AWAITING_PROOF, TransferPaymentStatus.IN_REVIEW] as const;

/** Quién lo inició: el profesional desde Mi plan, o un admin que anotó un pago recibido por fuera. */
export enum TransferPaymentOrigin {
  PROFESSIONAL = 'PROFESSIONAL',
  ADMIN = 'ADMIN',
}

/**
 * Pago de Resuelve PRO por transferencia bancaria, confirmado a mano por un
 * admin. Prepago por períodos (1, 3 o 6 meses de 30 días), sin renovación
 * automática. El monto se fija al crear (precio vigente × meses, con la
 * oferta de bienvenida en el primer mes si corresponde) y no cambia después.
 */
@Entity('transfer_payments')
@Index('IDX_transfer_payments_status', ['status', 'createdAt'])
export class TransferPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  /** Código para el concepto de la transferencia (`RES-7F3K9Q`): identifica el pago sin datos personales. */
  @Column({ type: 'varchar', length: 12, unique: true })
  reference: string;

  @Column({ type: 'enum', enum: TransferPaymentStatus, enumName: 'transfer_payment_status' })
  status: TransferPaymentStatus;

  @Column({ type: 'enum', enum: TransferPaymentOrigin, enumName: 'transfer_payment_origin' })
  origin: TransferPaymentOrigin;

  @Column({ type: 'smallint' })
  months: number;

  /** Lo que tiene que transferir (pesos enteros). */
  @Column({ type: 'integer' })
  amountArs: number;

  /** Precio mensual vigente al crear. */
  @Column({ type: 'integer' })
  basePriceArs: number;

  /** Oferta aplicada al primer mes (se consume al aprobar). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  offerCode: string | null;

  /** Comprobante en el almacenamiento privado (Cloudinary `type=private`). Solo el id. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  proofPublicId: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  proofFormat: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  proofUploadedAt: Date | null;

  /** Se borró el archivo del comprobante (retención cumplida); el registro del pago queda. */
  @Column({ type: 'timestamptz', nullable: true })
  proofDeletedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Visible para el profesional ("No encontramos la transferencia"). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

  /** Nota interna del admin (nunca se muestra al profesional). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  adminNote: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  periodEnd: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  /** Alias o CBU/CVU donde devolver al arrepentirse. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  refundDestination: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
