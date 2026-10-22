import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { City } from '../catalog/city.entity';
import { Service } from '../catalog/service.entity';
import { User } from '../users/user.entity';

/**
 * "Avisame cuando haya": una persona buscó un servicio en una localidad sin
 * profesionales y pidió que le avisemos. Una por persona, localidad y servicio.
 * Se avisa una sola vez (`notified_at`); volver a pedirlo la reactiva.
 * No es un pedido de presupuesto: no se manda a nadie ni tiene texto libre.
 */
@Entity('demand_alerts')
@Index('UQ_demand_alerts_user_city_service', ['userId', 'cityId', 'serviceId'], { unique: true })
@Index('IDX_demand_alerts_pending', ['cityId', 'serviceId'], { where: 'notified_at IS NULL' })
export class DemandAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'FK_demand_alerts_user' })
  user: User;

  @Column('uuid')
  cityId: string;

  @ManyToOne(() => City, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'city_id', foreignKeyConstraintName: 'FK_demand_alerts_city' })
  city: City;

  @Column('uuid')
  serviceId: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id', foreignKeyConstraintName: 'FK_demand_alerts_service' })
  service: Service;

  /** Último pedido del aviso (al reactivarlo se renueva). */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** Cuándo se avisó que ya hay profesionales (null = pendiente). */
  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;
}
