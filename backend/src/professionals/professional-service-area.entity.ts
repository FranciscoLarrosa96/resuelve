import { CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Zone } from '../catalog/zone.entity';
import { ProfessionalProfile } from './professional-profile.entity';

/** Zonas donde trabaja un profesional (N:M). */
@Entity('professional_service_areas')
@Index(['zoneId'])
export class ProfessionalServiceArea {
  @PrimaryColumn('uuid')
  professionalId: string;

  @PrimaryColumn('uuid')
  zoneId: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.serviceAreas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @ManyToOne(() => Zone, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'zone_id' })
  zone: Zone;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
