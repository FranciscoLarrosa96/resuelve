import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type EmailVerificationPurpose = 'EMAIL_VERIFICATION';

/**
 * Un código de 6 dígitos por propósito/usuario a la vez: generar uno nuevo
 * consume el anterior. Solo se guarda el hash (nunca el código en texto plano).
 */
@Entity('email_verification_codes')
@Index('idx_email_verification_codes_user_purpose', ['userId', 'purpose', 'createdAt'])
export class EmailVerificationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: EmailVerificationPurpose;

  @Column({ length: 64 })
  codeHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'smallint', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
