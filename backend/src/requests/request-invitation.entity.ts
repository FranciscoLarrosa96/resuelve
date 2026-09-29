import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { InvitationStatus } from './request.enums';
import { ServiceRequest } from './service-request.entity';

export enum RequestAttributionSource {
  ORGANIC_SEARCH = 'ORGANIC_SEARCH',
  PRO_FEATURED = 'PRO_FEATURED',
  DIRECT_PUBLIC_PROFILE = 'DIRECT_PUBLIC_PROFILE',
  DIRECT_TARGETED = 'DIRECT_TARGETED',
  MARKETPLACE_DISCOVERY = 'MARKETPLACE_DISCOVERY',
  MULTI_SELECT = 'MULTI_SELECT',
  OTHER = 'OTHER',
}

/** El cliente le pidió presupuesto a este profesional (máx. 3 por pedido). */
@Entity('request_invitations')
@Index(['requestId', 'professionalId'], { unique: true })
@Index(['professionalId', 'status'])
@Index('IDX_request_invitations_professional_sent', ['professionalId', 'sentAt'])
export class RequestInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, (r) => r.invitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    enumName: 'invitation_status',
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  sentAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  /** El cliente inició el pedido desde la ficha de este profesional. */
  @Column({ type: 'boolean', default: false })
  targeted: boolean;

  /** Momento en que esta oportunidad puede verla/responderla este profesional. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt: Date;

  /** Origen persistido por profesional; datos previos a Fase 2 quedan OTHER. */
  @Column({ type: 'varchar', length: 32, default: RequestAttributionSource.OTHER })
  attributionSource: RequestAttributionSource;
}
