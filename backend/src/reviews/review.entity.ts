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

/** Reseña de un trabajo contratado por Resuelve. Una por solicitud. */
@Entity('reviews')
@Index(['requestId'], { unique: true })
@Index(['professionalId', 'createdAt'])
@Check('ck_reviews_rating', '"rating" BETWEEN 1 AND 5')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

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

  /** Siempre true: solo se puede reseñar un trabajo real hecho por Resuelve. */
  @Column({ default: true })
  verifiedWork: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
