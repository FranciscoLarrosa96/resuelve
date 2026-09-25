import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Zone } from '../catalog/zone.entity';
import { ProfessionalProfile } from './professional-profile.entity';

/** Foto de un trabajo terminado. Si viene de un pedido de Resuelve, `requestId` lo vincula. */
@Entity('portfolio_items')
@Index(['professionalId', 'sortOrder'])
export class PortfolioItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, (p) => p.portfolio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ length: 140 })
  title: string;

  @Column({ length: 500 })
  imageUrl: string;

  @Column({ type: 'uuid', nullable: true })
  zoneId: string | null;

  @ManyToOne(() => Zone, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'zone_id' })
  zone: Zone | null;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
