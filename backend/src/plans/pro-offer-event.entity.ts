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

export enum ProOfferEventType {
  /** La oferta se mostró (deduplicado por profesional + oferta + superficie + día de Argentina). */
  SHOWN = 'SHOWN',
  /** Tocó el CTA de la oferta (misma deduplicación). */
  CLICKED = 'CLICKED',
  /** La usó (lo escribe el servidor al redimirla; nunca llega del frontend). */
  REDEEMED = 'REDEEMED',
}

export enum ProOfferSurface {
  /** Contador de presupuestos (Solicitudes y el éxito del presupuesto). */
  REQUESTS_USAGE = 'REQUESTS_USAGE',
  /** Diálogo del intento de responder con el cupo agotado. */
  LIMIT_MODAL = 'LIMIT_MODAL',
  PLAN_PAGE = 'PLAN_PAGE',
}

/**
 * Embudo de una oferta (mostrada → click → usada). Sin datos personales:
 * profesional, código, superficie y hora. `dedupeKey` único: rerenders y
 * recargas no inflan los números.
 */
@Entity('pro_offer_events')
@Index('IDX_pro_offer_events_offer_type_occurred', ['offerCode', 'type', 'occurredAt'])
export class ProOfferEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: ProOfferEventType, enumName: 'pro_offer_event_type' })
  type: ProOfferEventType;

  @Column({ type: 'enum', enum: ProOfferSurface, enumName: 'pro_offer_surface', nullable: true })
  surface: ProOfferSurface | null;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 40 })
  offerCode: string;

  @Column({ type: 'char', length: 64, unique: true })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
