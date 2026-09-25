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
 * El profesional puede crearla (queda PENDING); solo un revisor (panel admin
 * futuro / seed) la pasa a VERIFIED o REJECTED. No hay endpoint para eso.
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

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
