import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';

/**
 * Uso real de una oferta comercial de PRO. Una fila por profesional y código
 * (unique): dos activaciones simultáneas, reintentos o dos pestañas terminan
 * en UNA redención. Guarda los montos con los que se aplicó (recalculados en
 * el servidor, nunca enviados por el frontend).
 */
@Entity('pro_offer_redemptions')
@Unique('UQ_pro_offer_redemptions_professional_offer', ['professionalId', 'offerCode'])
export class ProOfferRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: ProfessionalProfile;

  @Column({ type: 'varchar', length: 40 })
  offerCode: string;

  @Column({ type: 'smallint' })
  discountPercent: number;

  /** Ciclos (meses) a los que aplica el descuento; después, precio base. */
  @Column({ type: 'smallint' })
  cycles: number;

  @Column({ type: 'integer' })
  basePriceArs: number;

  @Column({ type: 'integer' })
  discountedPriceArs: number;

  @CreateDateColumn({ type: 'timestamptz' })
  redeemedAt: Date;
}
