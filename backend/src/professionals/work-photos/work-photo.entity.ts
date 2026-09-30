import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../professional-profile.entity';

/**
 * "Trabajos realizados": foto PÚBLICA de un trabajo propio (máximo 5 por
 * perfil, `work-photo-rules.ts`). Solo `publicId` de Cloudinary + URL de
 * entrega optimizada; nada de ubicación, cliente ni EXIF.
 */
@Entity('professional_work_photos')
@Index('IDX_professional_work_photos_order', ['professionalId', 'sortOrder'])
@Unique('UQ_professional_work_photos_public_id', ['publicId'])
export class ProfessionalWorkPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id', foreignKeyConstraintName: 'FK_professional_work_photos_professional' })
  professional: ProfessionalProfile;

  /** `resuelve/professional-work/<professionalProfileId>/<uuid>`. Único: confirmar dos veces no duplica. */
  @Column({ length: 255 })
  publicId: string;

  @Column({ length: 500 })
  imageUrl: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Plan downgrade archive is reversible; restoring is an explicit owner action. */
  @Column({ default: false })
  archivedByPlan: boolean;

  @Column({ default: false })
  featured: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  caption: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
