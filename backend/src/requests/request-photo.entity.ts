import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ServiceRequest } from './service-request.entity';

/** Foto adjunta al pedido. Por ahora solo URL (sin Cloudinary). */
@Entity('request_photos')
@Index(['requestId', 'sortOrder'])
export class RequestPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  requestId: string;

  @ManyToOne(() => ServiceRequest, (r) => r.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ServiceRequest;

  @Column({ length: 500 })
  url: string;

  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;
}
