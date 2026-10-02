import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { User } from '../users/user.entity';

/**
 * "Guardar profesional": una acción del cliente, única por cliente +
 * profesional. No es una contratación (eso sale de los Jobs) y quitarlo no
 * toca ningún historial.
 */
@Entity('professional_favorites')
@Unique('UQ_professional_favorites_client_professional', ['clientId', 'professionalId'])
@Index('IDX_professional_favorites_client_created', ['clientId', 'createdAt'])
export class ProfessionalFavorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: User;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
