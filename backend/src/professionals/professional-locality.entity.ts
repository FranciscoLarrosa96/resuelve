import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { City } from '../catalog/city.entity';
import { ProfessionalProfile } from './professional-profile.entity';

/**
 * Localidades donde trabaja un profesional (N:M). Un solo perfil, reputación y
 * plan aunque cubra varias. En cada localidad: toda la ciudad
 * (`coversEntireCity`) o los barrios guardados en `professional_service_areas`
 * que pertenecen a ella. Ver `coversLocation` en professional-rules.ts.
 */
@Entity('professional_localities')
@Index(['cityId'])
export class ProfessionalLocality {
  @PrimaryColumn('uuid')
  professionalId: string;

  @PrimaryColumn('uuid')
  cityId: string;

  @Column({ default: false })
  coversEntireCity: boolean;

  @ManyToOne(() => ProfessionalProfile, (p) => p.localities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @ManyToOne(() => City, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'city_id' })
  city: City;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
