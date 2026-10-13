import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { ServiceRequest } from '../service-request.entity';

/**
 * Consulta de un profesional invitado al cliente ANTES de presupuestar
 * ("¿Tenés foto de la pérdida?") y la respuesta del cliente. Reglas en
 * `request-question-rules.ts`: pocas, una a la vez, sin teléfonos ni emails
 * (el contacto se comparte recién al elegir un presupuesto).
 */
@Entity('request_questions')
@Index('IDX_request_questions_request', ['requestId', 'professionalId', 'askedAt'])
export class RequestQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id', foreignKeyConstraintName: 'FK_request_questions_request' })
  request: ServiceRequest;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id', foreignKeyConstraintName: 'FK_request_questions_professional' })
  professional: ProfessionalProfile;

  @Column({ length: 500 })
  question: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  answer: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  askedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt: Date | null;
}
