import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Service } from '../catalog/service.entity';
import { Zone } from '../catalog/zone.entity';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { User } from '../users/user.entity';
import { Party, RequestStatus, RequestUrgency } from './request.enums';
import { RequestInvitation } from './request-invitation.entity';
import { RequestPhoto } from './request-photo.entity';

/**
 * El pedido del cliente (lo que hoy vive en RequestStore / ClientRequestsStore).
 * `exactAddress` es privada: solo la ve el dueño y el profesional elegido
 * (ver request.presenter.ts). Los demás ven solo la zona.
 */
@Entity('service_requests')
@Index(['clientId', 'createdAt'])
@Index(['status'])
export class ServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: User;

  @Column('uuid')
  serviceId: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  /** Resumen corto: "Pérdida bajo mesada". */
  @Column({ length: 140 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: RequestUrgency,
    enumName: 'request_urgency',
    default: RequestUrgency.FLEXIBLE,
  })
  urgency: RequestUrgency;

  @Column('uuid')
  zoneId: string;

  @ManyToOne(() => Zone, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zone_id' })
  zone: Zone;

  @Column({ type: 'date', nullable: true })
  desiredDate: string | null;

  /** Texto libre acotado: "después de las 16", "a la mañana". */
  @Column({ type: 'varchar', length: 80, nullable: true })
  desiredTimeRange: string | null;

  @Column({ type: 'enum', enum: RequestStatus, enumName: 'request_status', default: RequestStatus.DRAFT })
  status: RequestStatus;

  @Column({ type: 'varchar', length: 240, nullable: true })
  exactAddress: string | null;

  @Column({ type: 'uuid', nullable: true })
  selectedProfessionalId: string | null;

  @ManyToOne(() => ProfessionalProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'selected_professional_id' })
  selectedProfessional: ProfessionalProfile | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedQuoteId: string | null;

  // Referencia por nombre para evitar el import circular Quote ↔ ServiceRequest.
  @ManyToOne('Quote', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accepted_quote_id' })
  acceptedQuote?: unknown;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Quién confirmó que el trabajo se realizó. Trazabilidad interna: no es una valoración. */
  @Column({ type: 'enum', enum: Party, enumName: 'appointment_party', nullable: true })
  completedBy: Party | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @OneToMany(() => RequestPhoto, (photo) => photo.request, { cascade: ['insert'] })
  photos: RequestPhoto[];

  @OneToMany(() => RequestInvitation, (inv) => inv.request)
  invitations: RequestInvitation[];

  /** Control optimista de concurrencia además de los locks en operaciones críticas. */
  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
