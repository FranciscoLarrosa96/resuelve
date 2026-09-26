import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { InvitationStatus } from './request.enums';
import { ServiceRequest } from './service-request.entity';

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
}
