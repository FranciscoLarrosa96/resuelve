import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ServiceRequest } from '../requests/service-request.entity';
import { User } from '../users/user.entity';

/**
 * Dos tipos (`verifiedWork`):
 *  - verificada: reseña de un trabajo hecho por Resuelve; una por solicitud;
 *  - por invitación: sin solicitud (`requestId` null); una por cliente y profesional.
 */
@Entity('reviews')
@Index(['requestId'], { unique: true })
@Index(['professionalId', 'createdAt'])
@Index('uq_reviews_invited_client_professional', ['professionalId', 'clientId'], {
  unique: true,
  where: '"request_id" IS NULL',
})
@Check('ck_reviews_rating', '"rating" BETWEEN 1 AND 5')
@Check(
  'ck_reviews_kind',
  '("verified_work" AND "request_id" IS NOT NULL) OR (NOT "verified_work" AND "request_id" IS NULL)',
)
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @ManyToOne(() => ServiceRequest, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest | null;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column('uuid')
  clientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: User;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** true = trabajo real hecho por Resuelve; false = reseña por invitación (no cuenta en rating ni ranking). */
  @Column({ default: true })
  verifiedWork: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
