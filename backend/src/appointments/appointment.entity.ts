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

/**
 * PROPOSED  — el profesional elegido propuso fecha y horario.
 * CONFIRMED — el cliente la confirmó (la solicitud pasa a SCHEDULED).
 * DECLINED  — el cliente pidió otro horario (rechaza la cita, no al profesional).
 * CANCELLED — se canceló o se reemplazó por otra propuesta (reprogramar).
 * COMPLETED — el cliente o el profesional confirmó que el trabajo se realizó.
 */
export enum AppointmentStatus {
  PROPOSED = 'PROPOSED',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

/** Como máximo una cita por solicitud en alguno de estos estados (índice único parcial). */
export const ACTIVE_APPOINTMENT_STATUSES = [AppointmentStatus.PROPOSED, AppointmentStatus.CONFIRMED] as const;

/** Quién canceló una cita (mismo tipo `appointment_party` que `service_requests.completed_by`). */
export { Party as AppointmentParty } from '../requests/request.enums';

/** Duraciones estimadas que puede elegir el profesional (minutos). */
export const APPOINTMENT_DURATIONS = [30, 60, 90, 120, 180, 240, 360, 480] as const;

/**
 * Cita de trabajo entre el cliente y el profesional elegido. Una solicitud
 * puede tener varias (historial: propuestas rechazadas, reprogramaciones),
 * pero como máximo una activa (`uq_appointments_active_per_request`).
 * Los horarios se guardan en UTC (timestamptz) y se muestran en hora de Argentina.
 */
@Entity('appointments')
@Index('IDX_appointments_request_id', ['requestId'])
@Index('uq_appointments_active_per_request', ['requestId'], {
  unique: true,
  where: `"status" IN ('PROPOSED', 'CONFIRMED')`,
})
@Index(['professionalId', 'scheduledStart'])
@Check('ck_appointments_range', '"scheduled_end" > "scheduled_start"')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  @Column('uuid')
  quoteId: string;

  @ManyToOne(() => Quote, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;

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

  @Column({ type: 'timestamptz' })
  scheduledStart: Date;

  /** Inicio + duración estimada. */
  @Column({ type: 'timestamptz' })
  scheduledEnd: Date;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.PROPOSED,
  })
  status: AppointmentStatus;

  /** Nota opcional del profesional ("Llevo los materiales"). */
  @Column({ type: 'varchar', length: 280, nullable: true })
  note: string | null;

  @Column({ type: 'enum', enum: Party, enumName: 'appointment_party', nullable: true })
  cancelledBy: Party | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
