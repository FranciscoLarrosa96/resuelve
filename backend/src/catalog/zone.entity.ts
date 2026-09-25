import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { City } from './city.entity';

/** Barrio / zona dentro de una ciudad (Centro, Villa Italia…). */
@Entity('zones')
@Index(['cityId', 'slug'], { unique: true })
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  cityId: string;

  @ManyToOne(() => City, (city) => city.zones, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'city_id' })
  city: City;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120 })
  slug: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  active: boolean;
}
