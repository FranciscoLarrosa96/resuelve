import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { PlanTier, ProfessionalStatus } from './professional.enums';
import { ProfessionalService } from './professional-service.entity';
import { ProfessionalServiceArea } from './professional-service-area.entity';
import { ProfessionalVerification } from './professional-verification.entity';
import { PortfolioItem } from './portfolio-item.entity';

/**
 * "Modo profesional" de un usuario (relación 1:1 opcional).
 * Las métricas (rating, reseñas, trabajos) las calcula el backend a partir
 * de datos reales; ningún endpoint permite escribirlas.
 */
@Entity('professional_profiles')
@Check('ck_professional_profiles_rating', '"average_rating" >= 0 AND "average_rating" <= 5')
export class ProfessionalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Único: lo garantiza la relación 1:1 (constraint REL_… en la migración). */
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (user) => user.professionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Título público: "Electricista matriculado". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'smallint', default: 0 })
  yearsExperience: number;

  /**
   * true = trabaja en cualquier zona activa de su ciudad (hoy: Tandil). Las
   * zonas cargadas se conservan pero se ignoran mientras sea true, así al
   * volver a "Solo algunos barrios" se recuperan.
   */
  @Column({ default: false })
  coversEntireCity: boolean;

  @Column({
    type: 'enum',
    enum: ProfessionalStatus,
    enumName: 'professional_status',
    default: ProfessionalStatus.ACTIVE,
  })
  status: ProfessionalStatus;

  @Column({ default: false })
  availableToday: boolean;

  /** Fecha (día) en que se marcó disponible; "hoy" vence solo al día siguiente. */
  @Column({ type: 'date', nullable: true })
  availableOn: string | null;

  @Column({ type: 'integer', nullable: true })
  averageResponseMinutes: number | null;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  averageRating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  @Column({ default: 0 })
  completedJobsCount: number;

  @Column({ type: 'enum', enum: PlanTier, enumName: 'plan_tier', default: PlanTier.FREE })
  planTier: PlanTier;

  /**
   * Vencimiento de un PRO temporal (fundadores, prueba manual). null = sin
   * vencimiento. Vencido, el plan efectivo es FREE (ver `effectivePlan`); no se borra nada.
   */
  @Column({ type: 'timestamptz', nullable: true })
  planExpiresAt: Date | null;

  @OneToMany(() => ProfessionalService, (ps) => ps.professional)
  services: ProfessionalService[];

  @OneToMany(() => ProfessionalServiceArea, (area) => area.professional)
  serviceAreas: ProfessionalServiceArea[];

  @OneToMany(() => ProfessionalVerification, (v) => v.professional)
  verifications: ProfessionalVerification[];

  @OneToMany(() => PortfolioItem, (item) => item.professional)
  portfolio: PortfolioItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
