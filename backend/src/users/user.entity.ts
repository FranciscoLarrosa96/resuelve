import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Zone } from '../catalog/zone.entity';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';

/**
 * Una sola cuenta por persona. Es cliente siempre; además puede tener un
 * ProfessionalProfile ("Modo profesional") sin crear otra cuenta.
 */
@Entity('users')
@Index('uq_users_email_lower', { synchronize: false }) // índice único sobre lower(email), ver migración
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  firstName: string;

  @Column({ length: 80 })
  lastName: string;

  /** Siempre guardado en minúsculas. */
  @Column({ length: 254 })
  email: string;

  /** Hash Argon2id. Nunca se selecciona por defecto ni se serializa. */
  @Column({ length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  /** Acceso al panel de administración. Solo se otorga con `npm run admin:grant`. */
  @Column({ default: false })
  isAdmin: boolean;

  @Column({ type: 'uuid', nullable: true })
  defaultZoneId: string | null;

  @ManyToOne(() => Zone, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_zone_id' })
  defaultZone: Zone | null;

  @OneToOne('ProfessionalProfile', (profile: ProfessionalProfile) => profile.user)
  professionalProfile?: ProfessionalProfile | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
