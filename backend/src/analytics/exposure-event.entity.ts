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
 * Únicos eventos de analytics propios: lo demás del embudo (solicitudes,
 * presupuestos, aceptados, realizados) se deriva de las tablas de negocio.
 */
export enum ExposureEventType {
  /** La tarjeta del profesional estuvo visible (≥ 50 % durante ≥ 500 ms) en resultados. */
  SEARCH_IMPRESSION = 'SEARCH_IMPRESSION',
  /** Se abrió su perfil público desde la experiencia cliente. */
  PROFILE_VIEW = 'PROFILE_VIEW',
}

/**
 * Exposición de un profesional. Anónimo por diseño: ni usuario, ni IP, ni
 * dirección, ni texto libre; solo el contexto de búsqueda (servicio, barrio) y
 * el hash de una clave de sesión aleatoria del navegador. `dedupeKey` (único)
 * hace que reintentos, rerenders y refrescos no inflen los números.
 */
@Entity('exposure_events')
@Index('IDX_exposure_events_professional_type_occurred', ['professionalId', 'type', 'occurredAt'])
export class ExposureEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: ExposureEventType, enumName: 'exposure_event_type' })
  type: ExposureEventType;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  @Column({ type: 'uuid', nullable: true })
  serviceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  zoneId: string | null;

  /** Búsqueda filtrada por "Disponible hoy" (urgente). */
  @Column({ type: 'boolean', nullable: true })
  isUrgent: boolean | null;

  @Column({ default: false })
  isFeaturedPlacement: boolean;

  /** Página de resultados (1 = primera). null en vistas de perfil. */
  @Column({ type: 'smallint', nullable: true })
  page: number | null;

  /** sha256 de la clave anónima de sesión (nunca la clave en claro). */
  @Column({ type: 'char', length: 64 })
  sessionKeyHash: string;

  @Column({ type: 'char', length: 64, unique: true })
  dedupeKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
