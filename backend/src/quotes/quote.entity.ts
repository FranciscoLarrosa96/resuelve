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
} from 'typeorm';
import { moneyTransformer } from '../common/money/money';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ServiceRequest } from '../requests/service-request.entity';
import { QuoteStatus } from './quote.enums';
import { QuoteItem } from './quote-item.entity';

/**
 * Presupuesto de un profesional para una solicitud.
 * Montos en numeric(12,2); `totalAmount` lo calcula SIEMPRE el servidor.
 * Índice único parcial `uq_quotes_active_per_professional` (en la migración):
 * un profesional no puede tener dos presupuestos activos en el mismo pedido.
 */
@Entity('quotes')
@Index(['requestId', 'status'])
@Index('IDX_quotes_professional_created', ['professionalId', 'createdAt'])
@Index('IDX_quotes_professional_accepted', ['professionalId', 'acceptedAt'], {
  where: '"accepted_at" IS NOT NULL',
})
@Index('uq_quotes_active_per_professional', ['requestId', 'professionalId'], {
  unique: true,
  where: `"status" IN ('PENDING', 'ACCEPTED')`,
})
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  @Column('uuid')
  professionalId: string;

  @ManyToOne(() => ProfessionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional: ProfessionalProfile;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyTransformer })
  laborAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyTransformer })
  materialsAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: moneyTransformer })
  totalAmount: string;

  @Column({ type: 'timestamptz', nullable: true })
  availableFrom: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ type: 'enum', enum: QuoteStatus, enumName: 'quote_status', default: QuoteStatus.PENDING })
  status: QuoteStatus;

  /** Cuándo el cliente lo aceptó ("Tu mes" cuenta aceptados y su valor por esta fecha). */
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
