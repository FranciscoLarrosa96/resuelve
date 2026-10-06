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

  /** Null = todavía no demostró que controla el email. El backend es la fuente de verdad. */
  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** Recibir por email los avisos de actividad. Se apaga en Mi perfil o con el enlace de baja. */
  @Column({ type: 'boolean', default: true })
  emailNotifications: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  /** Acceso al panel de administración. Solo se otorga con `npm run admin:grant`. */
  @Column({ default: false })
  isAdmin: boolean;

  /** Versión de los Términos de Uso aceptada al crear la cuenta (`legal/terms.ts`). Null = cuenta anterior a los Términos. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  termsVersion: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt: Date | null;

  /** Dio de baja su cuenta: los datos personales se anonimizaron (`account/account-deletion.ts`). */
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

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
