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
 *
 * El texto (título y detalle) NO se guarda: se arma en el frontend por tipo
 * (`notificationCopy`) con referencias y nada de PII. La ruta tampoco: se
 * deriva al leer (`notificationRoute`) y nunca autoriza nada por sí sola.
 */
export enum NotificationType {
  CLIENT_QUOTE_RECEIVED = 'CLIENT_QUOTE_RECEIVED',
  /** El profesional editó un presupuesto pendiente (se junta con el aviso sin leer del mismo presupuesto). */
  CLIENT_QUOTE_UPDATED = 'CLIENT_QUOTE_UPDATED',
  CLIENT_APPOINTMENT_PROPOSED = 'CLIENT_APPOINTMENT_PROPOSED',
  CLIENT_APPOINTMENT_RESCHEDULED = 'CLIENT_APPOINTMENT_RESCHEDULED',
  /** El profesional agendó el trabajo desde su Agenda (no es una propuesta que confirmar). */
  CLIENT_JOB_SCHEDULED = 'CLIENT_JOB_SCHEDULED',
  CLIENT_JOB_RESCHEDULED = 'CLIENT_JOB_RESCHEDULED',
  CLIENT_JOB_STARTED = 'CLIENT_JOB_STARTED',
  CLIENT_JOB_CANCELLED = 'CLIENT_JOB_CANCELLED',
  /** Trabajo realizado sin reseña: "Podés dejar una reseña". Cubre también "trabajo completado". */
  CLIENT_REVIEW_AVAILABLE = 'CLIENT_REVIEW_AVAILABLE',
  /** Terminó el horario y nadie cerró el trabajo: "¿Se realizó?". Existe desde `availableAt` (fin + espera), sin cron. */
  CLIENT_JOB_CLOSE_DUE = 'CLIENT_JOB_CLOSE_DUE',
  PROFESSIONAL_SELECTED = 'PROFESSIONAL_SELECTED',
  PRO_APPOINTMENT_CONFIRMED = 'PRO_APPOINTMENT_CONFIRMED',
  PRO_APPOINTMENT_DECLINED = 'PRO_APPOINTMENT_DECLINED',
  /** Oportunidad (discovery) disponible. Se lee al abrir la solicitud o al responderla. */
  PRO_REQUEST_RECEIVED = 'PRO_REQUEST_RECEIVED',
  /** Un cliente le pidió presupuesto a él en particular (nunca consume cupo Free). */
  PRO_TARGETED_REQUEST_RECEIVED = 'PRO_TARGETED_REQUEST_RECEIVED',
  PRO_JOB_CLOSE_DUE = 'PRO_JOB_CLOSE_DUE',
  PRO_REVIEW_RECEIVED = 'PRO_REVIEW_RECEIVED',
  PRO_REFERRAL_REGISTERED = 'PRO_REFERRAL_REGISTERED',
  /** El referido se activó (con `payload.rewardDays` si sumó PRO en ese momento). */
  PRO_REFERRAL_ACTIVATED = 'PRO_REFERRAL_ACTIVATED',
  /** Al referido: su invitación le dio días de PRO. */
  PRO_BONUS_GRANTED = 'PRO_BONUS_GRANTED',
}

/** Las dos formas de "nueva solicitud": dejan de pedir algo juntas (se respondió, eligieron a otro, se canceló). */
export const PRO_NEW_REQUEST_TYPES: readonly NotificationType[] = [
  NotificationType.PRO_REQUEST_RECEIVED,
  NotificationType.PRO_TARGETED_REQUEST_RECEIVED,
];

/** Modo en el que se ve cada notificación: los contadores de cliente y profesional no se mezclan. */
export enum NotificationAudience {
  CLIENT = 'CLIENT',
  PROFESSIONAL = 'PROFESSIONAL',
}

export const AUDIENCE_TYPES: Record<NotificationAudience, readonly NotificationType[]> = {
  CLIENT: [
    NotificationType.CLIENT_QUOTE_RECEIVED,
    NotificationType.CLIENT_QUOTE_UPDATED,
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
    NotificationType.CLIENT_JOB_SCHEDULED,
    NotificationType.CLIENT_JOB_RESCHEDULED,
    NotificationType.CLIENT_JOB_STARTED,
    NotificationType.CLIENT_JOB_CANCELLED,
    NotificationType.CLIENT_REVIEW_AVAILABLE,
    NotificationType.CLIENT_JOB_CLOSE_DUE,
  ],
  PROFESSIONAL: [
    NotificationType.PRO_REQUEST_RECEIVED,
    NotificationType.PRO_TARGETED_REQUEST_RECEIVED,
    NotificationType.PROFESSIONAL_SELECTED,
    NotificationType.PRO_APPOINTMENT_CONFIRMED,
    NotificationType.PRO_APPOINTMENT_DECLINED,
    NotificationType.PRO_JOB_CLOSE_DUE,
    NotificationType.PRO_REVIEW_RECEIVED,
    NotificationType.PRO_REFERRAL_REGISTERED,
    NotificationType.PRO_REFERRAL_ACTIVATED,
    NotificationType.PRO_BONUS_GRANTED,
  ],
};

/**
 * Dónde está la acción de cada novedad del profesional (única fuente: el
 * sidebar suma por sección y cada pestaña de Solicitudes muestra solo lo suyo).
 * - REQUESTS + tab = pestaña de `/pro/solicitudes` (estado de la invitación).
 * - AGENDA = `/pro/agenda` (horario confirmado; "pendiente de cierre" se suma aparte).
 * - PLAN / PROFILE = referidos y bonos (Mi plan) y reseñas recibidas (Tu mes, "Opiniones del mes"): solo suman al total del centro.
 * Las del cliente van todas a "Mis solicitudes".
 */
export type NotificationSection = 'REQUESTS' | 'AGENDA' | 'CLIENT_REQUESTS' | 'PLAN' | 'PROFILE' | 'CLOSURE';
export type NotificationTab = 'PENDING' | 'QUOTED' | 'SELECTED';

export const NOTIFICATION_DESTINATION: Record<
  NotificationType,
  { section: NotificationSection; tab: NotificationTab | null }
> = {
  CLIENT_QUOTE_RECEIVED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_QUOTE_UPDATED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_APPOINTMENT_PROPOSED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_APPOINTMENT_RESCHEDULED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_JOB_SCHEDULED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_JOB_RESCHEDULED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_JOB_STARTED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_JOB_CANCELLED: { section: 'CLIENT_REQUESTS', tab: null },
  CLIENT_REVIEW_AVAILABLE: { section: 'CLIENT_REQUESTS', tab: null },
  // "Pendiente de cierre" ya se cuenta aparte (`completionDue`): estas solo suman al total del centro.
  CLIENT_JOB_CLOSE_DUE: { section: 'CLOSURE', tab: null },
  PRO_JOB_CLOSE_DUE: { section: 'CLOSURE', tab: null },
  PRO_REQUEST_RECEIVED: { section: 'REQUESTS', tab: 'PENDING' },
  PRO_TARGETED_REQUEST_RECEIVED: { section: 'REQUESTS', tab: 'PENDING' },
  PRO_REVIEW_RECEIVED: { section: 'PROFILE', tab: null },
  PRO_REFERRAL_REGISTERED: { section: 'PLAN', tab: null },
  PRO_REFERRAL_ACTIVATED: { section: 'PLAN', tab: null },
  PRO_BONUS_GRANTED: { section: 'PLAN', tab: null },
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
@Index('IDX_notifications_user_created', ['userId', 'createdAt', 'id'])
@Index('IDX_notifications_user_read', ['userId', 'readAt'])
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

  /** Null solo en los avisos de referidos (no hay solicitud). */
  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @ManyToOne(() => ServiceRequest, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest | null;

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

  @Column({ type: 'uuid', nullable: true })
  referralId: string | null;

  /**
   * Desde cuándo existe para quien la recibe (null = desde `createdAt`). Una
   * oportunidad Free demorada no se anuncia hasta que se libera: se deriva al
   * leer (`available_at <= now()`), sin cron.
   */
  @Column({ type: 'timestamptz', nullable: true })
  availableAt: Date | null;

  /** Se abrió desde el centro (no por "marcar todas" ni por resolverse sola): tasa de apertura. */
  @Column({ type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  /** Datos mínimos sin PII (p. ej. `{ rewardDays: 15 }`). */
  @Column({ type: 'jsonb', nullable: true })
  payload: { rewardDays?: number } | null;

  /** "CLIENT_QUOTE_RECEIVED:<quoteId>": un mismo evento genera como máximo una notificación. */
  @Index('uq_notifications_dedupe_key', { unique: true })
  @Column({ length: 120 })
  dedupeKey: string;

  /** Envío por email: null = pendiente; SENDING / SENT / SKIPPED (no corresponde) / FAILED. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  emailStatus: 'SENDING' | 'SENT' | 'SKIPPED' | 'FAILED' | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailedAt: Date | null;

  @Column({ type: 'smallint', default: 0 })
  emailAttempts: number;

  /** Envío push: null = pendiente; SENDING / SENT / SKIPPED (no corresponde o sin dispositivos) / FAILED. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  pushStatus: 'SENDING' | 'SENT' | 'SKIPPED' | 'FAILED' | null;

  @Column({ type: 'timestamptz', nullable: true })
  pushedAt: Date | null;

  @Column({ type: 'smallint', default: 0 })
  pushAttempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;
}
