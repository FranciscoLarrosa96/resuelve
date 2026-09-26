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
import { Service } from '../catalog/service.entity';
import { ProfessionalProfile } from './professional-profile.entity';
import { VerificationStatus, VerificationType } from './professional.enums';

/**
 * Verificación de identidad, teléfono o matrícula.
 * El profesional la envía (queda PENDING); solo un revisor la pasa a VERIFIED
 * o REJECTED con `npm run verification:review` (no hay endpoint HTTP).
 * Cada envío es una fila nueva: las rechazadas/vencidas quedan como historial
 * y un índice parcial impide dos activas (PENDING/VERIFIED) para lo mismo.
 */
@Entity('professional_verifications')
@Index(['professionalId', 'type'])
export class ProfessionalVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.verifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ type: 'enum', enum: VerificationType, enumName: 'verification_type' })
  type: VerificationType;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  status: VerificationStatus;

  /** Para LICENSE: servicio al que aplica la matrícula (Gas, Electricidad…). */
  @Column({ type: 'uuid', nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'service_id' })
  service: Service | null;

  /** N.º de matrícula u otra referencia pública. Nunca datos del DNI. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Quién revisó (etiqueta del operador en el CLI). Interno: nunca sale por la API. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  reviewedBy: string | null;

  /** Motivo legible para el profesional cuando se rechaza. No es público. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

  /**
   * Documento de respaldo en almacenamiento PRIVADO (Cloudinary, type=private).
   * Solo el identificador: nunca una URL (las de revisión son firmadas y temporales).
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  documentPublicId: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  documentFormat: string | null;

  @Column({ type: 'integer', nullable: true })
  documentBytes: number | null;

  /** Cuándo se borró el archivo después de la revisión (se conserva la metadata). */
  @Column({ type: 'timestamptz', nullable: true })
  documentDeletedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
