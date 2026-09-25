import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Zone } from './zone.entity';

/** Ciudad donde opera Resuelve (Tandil, Azul, Olavarría…). */
@Entity('cities')
@Index(['slug'], { unique: true })
export class City {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120 })
  slug: string;

  /** Ej. "Buenos Aires". Texto simple: no hace falta una entidad Provincia todavía. */
  @Column({ length: 120 })
  province: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Zone, (zone) => zone.city)
  zones: Zone[];
}
