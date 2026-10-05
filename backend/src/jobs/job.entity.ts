import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { Quote } from '../quotes/quote.entity';
import { Party } from '../requests/request.enums';
import { ServiceRequest } from '../requests/service-request.entity';
import { User } from '../users/user.entity';

export enum JobStatus {
  TO_COORDINATE = 'TO_COORDINATE',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface JobChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

@Entity('jobs')
@Index('UQ_jobs_request_id', ['requestId'], { unique: true })
@Index('UQ_jobs_accepted_quote_id', ['acceptedQuoteId'], { unique: true })
@Index('IDX_jobs_professional_scheduled_date', ['professionalId', 'scheduledDate'])
@Index('IDX_jobs_client_status', ['clientId', 'status'])
@Check('ck_jobs_duration', '"duration_minutes" IS NULL OR ("duration_minutes" BETWEEN 1 AND 1440)')
@Check('ck_jobs_checklist_array', 'jsonb_typeof("checklist") = \'array\'')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  @Column('uuid')
  acceptedQuoteId: string;

  @ManyToOne(() => Quote, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accepted_quote_id' })
  acceptedQuote: Quote;

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

  @Column({ type: 'enum', enum: JobStatus, enumName: 'job_status', default: JobStatus.TO_COORDINATE })
  status: JobStatus;

  /** A calendar day in Argentina; time remains optional and is never inferred. */
  @Column({ type: 'date', nullable: true })
  scheduledDate: string | null;

  @Column({ type: 'time', nullable: true })
  scheduledTime: string | null;

  @Column({ type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'enum', enum: Party, enumName: 'appointment_party', nullable: true })
  cancelledBy: Party | null;

  @Column({ type: 'varchar', length: 2000, default: '' })
  privateNotes: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  checklist: JobChecklistItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('job_events')
@Index('IDX_job_events_job_created', ['jobId', 'createdAt'])
export class JobEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  jobId: string;

  @Column('uuid', { nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  details: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
