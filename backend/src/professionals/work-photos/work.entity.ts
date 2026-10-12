import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProfessionalProfile } from '../professional-profile.entity';

/**
 * "Trabajos realizados": un trabajo ("Casa 1", "Departamento centro") que
 * agrupa sus fotos (`professional_work_photos.work_id`). Free muestra 1 y
 * PRO hasta 10, con hasta 5 fotos cada uno (`work-photo-rules.ts`). Se
 * ordenan por fecha, del más reciente al más viejo. Nada de dirección ni cliente.
 */
@Entity('professional_works')
@Index('IDX_professional_works_professional', ['professionalId', 'doneOn'])
export class ProfessionalWork {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id', foreignKeyConstraintName: 'FK_professional_works_professional' })
  professional: ProfessionalProfile;

  @Column({ length: 60 })
  title: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  description: string | null;

  /** Mes y año del trabajo: siempre el día 1 ("2026-03-01"). */
  @Column({ type: 'date' })
  doneOn: string;

  /** Downgrade a Free: queda guardado y oculto; volver a mostrarlo es una acción del dueño. */
  @Column({ default: false })
  archivedByPlan: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
