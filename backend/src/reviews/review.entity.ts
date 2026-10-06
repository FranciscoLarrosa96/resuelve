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
 *  - por invitación: sin solicitud (`requestId` null); de una cuenta (`clientId`) o de un invitado sin
 *    cuenta (`reviewerName` + `reviewerEmail`, correo privado). Una por persona y profesional.
 */
@Entity('reviews')
@Index(['requestId'], { unique: true })
@Index(['professionalId', 'createdAt'])
@Index('uq_reviews_guest_email_professional', { synchronize: false }) // único sobre (professional_id, lower(reviewer_email)), ver migración
@Index('uq_reviews_invited_client_professional', ['professionalId', 'clientId'], {
  unique: true,
  where: '"request_id" IS NULL',
})
@Check('ck_reviews_rating', '"rating" BETWEEN 1 AND 5')
@Check(
  'ck_reviews_kind',
  '("verified_work" AND "request_id" IS NOT NULL AND "client_id" IS NOT NULL) OR (NOT "verified_work" AND "request_id" IS NULL AND ("client_id" IS NOT NULL OR ("reviewer_name" IS NOT NULL AND "reviewer_email" IS NOT NULL)))',
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

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: User | null;

  /** Invitado sin cuenta: solo el nombre de pila (es lo único que se publica). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  reviewerName: string | null;

  /** Invitado sin cuenta: PRIVADO, nunca sale en una API pública. Evita reseñar dos veces. */
  @Column({ type: 'varchar', length: 254, nullable: true })
  reviewerEmail: string | null;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  /** true = trabajo real hecho por Resuelve; false = reseña por invitación (no cuenta en rating ni ranking). */
  @Column({ default: true })
  verifiedWork: boolean;

  /** Ocultada por moderación: no se muestra ni cuenta (rating, cantidad), pero no se borra ni libera el lugar. */
  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  hiddenReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
