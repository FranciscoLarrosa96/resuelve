import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Service } from './service.entity';

/** Agrupador de servicios: Hogar y reparaciones, Exterior, Transporte, Tecnología. */
@Entity('categories')
@Index(['slug'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120 })
  slug: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Service, (service) => service.category)
  services: Service[];
}
