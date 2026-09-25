import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { ProfessionalProfile } from './professional-profile.entity';

/** Servicios que ofrece un profesional (N:M). */
@Entity('professional_services')
@Index(['serviceId'])
export class ProfessionalService {
  @PrimaryColumn('uuid')
  professionalId: string;

  @PrimaryColumn('uuid')
  serviceId: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.services, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
