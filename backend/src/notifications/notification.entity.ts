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
  /** Un cliente le pidió presupuesto (invitación nueva). Se lee al abrir la solicitud o al responderla. */
  PRO_REQUEST_RECEIVED = 'PRO_REQUEST_RECEIVED',
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
    NotificationType.PRO_REQUEST_RECEIVED,
    NotificationType.PROFESSIONAL_SELECTED,
    NotificationType.PRO_APPOINTMENT_CONFIRMED,
    NotificationType.PRO_APPOINTMENT_DECLINED,
  ],
};

/**
 * Dónde está la acción de cada novedad del profesional (única fuente: el
 * sidebar suma por sección y cada pestaña de Solicitudes muestra solo lo suyo).
 * - REQUESTS + tab = pestaña de `/pro/solicitudes` (estado de la invitación).
 * - AGENDA = `/pro/agenda` (horario confirmado; "pendiente de cierre" se suma aparte).
 * Las del cliente van todas a "Mis solicitudes".
 */
export type NotificationSection = 'REQUESTS' | 'AGENDA' | 'CLIENT_REQUESTS';
export type NotificationTab = 'PENDING' | 'QUOTED' | 'SELECTED';

export const NOTIFICATION_DESTINATION: Record<
  NotificationType,
  { section: NotificationSection; tab: NotificationTab | null }
> = {
  CLIENT_QUOTE_RECEIVED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_APPOINTMENT_PROPOSED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_APPOINTMENT_RESCHEDULED: { section: 'CLIENT_REQUESTS', tab: null },
  PRO_REQUEST_RECEIVED: { section: 'REQUESTS', tab: 'PENDING' },
  PROFESSIONAL_SELECTED: { section: 'REQUESTS', tab: 'SELECTED' },
  // "Necesitan otro horario": se propone otra fecha desde la solicitud (pestaña Aceptadas).
  PRO_APPOINTMENT_DECLINED: { section: 'REQUESTS', tab: 'SELECTED' },
  PRO_APPOINTMENT_CONFIRMED: { section: 'AGENDA', tab: null },
};

/** Tipos cuya acción vive en esa sección. */
export function typesInSection(section: NotificationSection): NotificationType[] {
  return (Object.keys(NOTIFICATION_DESTINATION) as NotificationType[]).filter(
    (t) => NOTIFICATION_DESTINATION[t].section === section,
  );
}

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
