import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro pendiente: nada de esto es una cuenta real todavía. Mientras
 * existe esta fila, `users` NO tiene ninguna fila para ese email; recién se
 * crea el `User` al verificar el código (`AuthService.verifyPendingRegistration`).
 * Un solo pending activo por email (`AuthModule` serializa el alta con un
 * advisory lock por email para evitar dos filas para el mismo email).
 */
@Entity('pending_registrations')
@Index('idx_pending_registrations_email', { synchronize: false }) // índice funcional sobre lower(email), ver migración
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Siempre en minúsculas. */
  @Column({ length: 254 })
  email: string;

  @Column({ length: 80 })
  firstName: string;

  @Column({ length: 80 })
  lastName: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'uuid', nullable: true })
  defaultZoneId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  referralCode: string | null;

  /** Hash Argon2id. Nunca la contraseña en texto plano. */
  @Column({ length: 255 })
  passwordHash: string;

  /** Hash SHA-256 del código de 6 dígitos. Nunca el código en texto plano. */
  @Column({ length: 64 })
  verificationCodeHash: string;

  @Column({ type: 'timestamptz' })
  verificationExpiresAt: Date;

  @Column({ type: 'smallint', default: 0 })
  verificationAttempts: number;

  @Column({ type: 'timestamptz' })
  lastCodeSentAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Vencimiento del registro pendiente completo (no solo del código). */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
