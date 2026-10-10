import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from './city.entity';

/**
 * Provincia (o CABA). Las 24 jurisdicciones se crean en la migración con su
 * código oficial de INDEC/Georef (`officialCode`, "06" = Buenos Aires): es el
 * identificador estable para importar localidades.
 */
@Entity('provinces')
export class Province {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 8, unique: true })
  officialCode: string;

  /** ISO 3166-2:AR ("AR-B"). */
  @Column({ type: 'varchar', length: 8, unique: true })
  isoCode: string;

  @Column({ length: 120 })
  name: string;

  /** Único y estable: es parte de las URLs públicas (/ciudades/buenos-aires/…). */
  @Column({ length: 120, unique: true })
  slug: string;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => City, (city) => city.provinceRef)
  localities: City[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
