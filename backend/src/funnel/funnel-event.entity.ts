import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';

/**
 * Embudo del profesional (activación → primer éxito → PRO → renovación).
 * Única lista de eventos propios de producto; lo que ya vive en otras tablas
 * no se duplica: apariciones y visitas (también las de espacios destacados)
 * son `exposure_events`, y el embudo de la oferta de bienvenida es
 * `pro_offer_events`. El reporte (`npm run funnel:report`) las combina.
 */
export enum FunnelEventType {
  // Activación
  PROFESSIONAL_REGISTERED = 'PROFESSIONAL_REGISTERED',
  PROFILE_COMPLETED = 'PROFILE_COMPLETED',
  FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED = 'FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED',
  FIRST_QUOTE_SENT = 'FIRST_QUOTE_SENT',
  FIRST_QUOTE_ACCEPTED = 'FIRST_QUOTE_ACCEPTED',
  FIRST_SUCCESS_REACHED = 'FIRST_SUCCESS_REACHED',
  // PRO
  PRO_PLAN_VIEWED = 'PRO_PLAN_VIEWED',
  PRO_CTA_CLICKED = 'PRO_CTA_CLICKED',
  PRO_CHECKOUT_STARTED = 'PRO_CHECKOUT_STARTED',
  PRO_PAYMENT_APPROVED = 'PRO_PAYMENT_APPROVED',
  PRO_CANCELLED = 'PRO_CANCELLED',
  PRO_RENEWED = 'PRO_RENEWED',
  // Free
  FREE_QUOTE_USED = 'FREE_QUOTE_USED',
  FREE_QUOTE_LIMIT_REACHED = 'FREE_QUOTE_LIMIT_REACHED',
  FREE_BLOCKED_OPPORTUNITY_VIEWED = 'FREE_BLOCKED_OPPORTUNITY_VIEWED',
  // Ventaja temporal
  EARLY_OPPORTUNITY_DELIVERED = 'EARLY_OPPORTUNITY_DELIVERED',
  DELAYED_OPPORTUNITY_UNLOCKED = 'DELAYED_OPPORTUNITY_UNLOCKED',
  // Atribución (apariciones y visitas destacadas: exposure_events)
  FEATURED_ATTRIBUTED_REQUEST = 'FEATURED_ATTRIBUTED_REQUEST',
}

/**
 * Un evento del embudo. Sin datos personales: profesional, tipo, hora y, a lo
 * sumo, una referencia interna (`ref`: id de solicitud, cobro o superficie).
 * `dedupeKey` único: reintentos, dobles clicks y avisos repetidos no suman.
 */
@Entity('pro_funnel_events')
@Index('IDX_pro_funnel_events_type_occurred', ['type', 'occurredAt'])
@Index('IDX_pro_funnel_events_professional_type', ['professionalId', 'type'])
export class FunnelEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: FunnelEventType, enumName: 'pro_funnel_event_type' })
  type: FunnelEventType;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  /** Referencia interna opcional (id de solicitud, de cobro, superficie). Nunca PII. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ref: string | null;

  @Column({ type: 'varchar', length: 200, unique: true })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
