import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceRequest } from '../requests/service-request.entity';
import { User } from '../users/user.entity';

/**
 * Eventos que le piden a la OTRA persona que vea o haga algo. Nunca se
 * notifica la propia acción. "Trabajo pendiente de cierre" no está acá: se
 * deriva de la cita confirmada cuyo horario ya terminó (sin cron).
 */
export enum NotificationType {
  CLIENT_QUOTE_RECEIVED = 'CLIENT_QUOTE_RECEIVED',
  CLIENT_APPOINTMENT_PROPOSED = 'CLIENT_APPOINTMENT_PROPOSED',
  CLIENT_APPOINTMENT_RESCHEDULED = 'CLIENT_APPOINTMENT_RESCHEDULED',
  PROFESSIONAL_SELECTED = 'PROFESSIONAL_SELECTED',
  PRO_APPOINTMENT_CONFIRMED = 'PRO_APPOINTMENT_CONFIRMED',
  PRO_APPOINTMENT_DECLINED = 'PRO_APPOINTMENT_DECLINED',
}

/** Modo en el que se ve cada notificación: los contadores de cliente y profesional no se mezclan. */
export enum NotificationAudience {
  CLIENT = 'CLIENT',
  PROFESSIONAL = 'PROFESSIONAL',
}

export const AUDIENCE_TYPES: Record<NotificationAudience, readonly NotificationType[]> = {
  CLIENT: [
    NotificationType.CLIENT_QUOTE_RECEIVED,
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
  ],
  PROFESSIONAL: [
    NotificationType.PROFESSIONAL_SELECTED,
    NotificationType.PRO_APPOINTMENT_CONFIRMED,
    NotificationType.PRO_APPOINTMENT_DECLINED,
  ],
};

/**
 * Notificación in-app. Solo referencias (solicitud, presupuesto, cita): nada
 * de dirección, teléfono ni textos del pedido. Leerla completa `readAt`; no se
 * borra. `dedupeKey` (único) garantiza una por evento aunque se reintente.
 */
@Entity('notifications')
@Index('IDX_notifications_unread', ['userId'], { where: '"read_at" IS NULL' })
@Index('IDX_notifications_user_request', ['userId', 'requestId'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type: NotificationType;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  // Por nombre para no importar Quote/Appointment (evita ciclos entre módulos).
  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  @ManyToOne('Quote', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote?: unknown;

  @Column({ type: 'uuid', nullable: true })
  appointmentId: string | null;

  @ManyToOne('Appointment', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment?: unknown;

  /** "CLIENT_QUOTE_RECEIVED:<quoteId>": un mismo evento genera como máximo una notificación. */
  @Index('uq_notifications_dedupe_key', { unique: true })
  @Column({ length: 120 })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
