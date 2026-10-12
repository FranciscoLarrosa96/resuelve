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
import { ProfessionalWork } from './work.entity';

/**
 * "Trabajos realizados": foto PÚBLICA de un trabajo propio, dentro de su
 * trabajo (`work_id`, hasta 5 por trabajo, `work-photo-rules.ts`). Solo
 * `publicId` de Cloudinary + URL de entrega optimizada; nada de ubicación,
 * cliente ni EXIF. `sortOrder` es el orden dentro del trabajo (0 = portada).
 */
@Entity('professional_work_photos')
@Index('IDX_professional_work_photos_order', ['professionalId', 'sortOrder'])
@Index('IDX_professional_work_photos_work', ['workId', 'sortOrder'])
@Unique('UQ_professional_work_photos_public_id', ['publicId'])
export class ProfessionalWorkPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id', foreignKeyConstraintName: 'FK_professional_work_photos_professional' })
  professional: ProfessionalProfile;

  @Column('uuid')
  workId: string;

  @ManyToOne(() => ProfessionalWork, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_id', foreignKeyConstraintName: 'FK_professional_work_photos_work' })
  work: ProfessionalWork;

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

  /** Legacy (foto principal del portfolio suelto): ya no se usa; la portada es la primera foto del trabajo. */
  @Column({ default: false })
  featured: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  caption: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
