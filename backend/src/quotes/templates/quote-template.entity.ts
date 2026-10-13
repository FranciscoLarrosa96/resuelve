import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';

/**
 * Plantilla de presupuesto del profesional ("Cambio de sifón"): el alcance,
 * las aclaraciones, la duración y los montos que repite seguido. Es privada
 * (solo la ve el dueño) y no es un presupuesto: usarla solo completa el
 * formulario, que se revisa antes de enviar. Tope en `quote-template-rules.ts`.
 */
@Entity('quote_templates')
@Index('IDX_quote_templates_professional', ['professionalId', 'createdAt'])
export class QuoteTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id', foreignKeyConstraintName: 'FK_quote_templates_professional' })
  professional: ProfessionalProfile;

  @Column({ length: 60 })
  name: string;

  @Column({ type: 'varchar', length: 2000 })
  description: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  estimatedDuration: string | null;

  /** Pesos enteros ARS (mismo criterio que el presupuesto). */
  @Column({ type: 'integer' })
  laborAmount: number;

  @Column({ type: 'integer' })
  materialsAmount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
