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
import { Province } from './province.entity';
import { Zone } from './zone.entity';

const numeric = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : Number(v)),
};

/** De dónde salió la localidad: el catálogo oficial (Georef, localidades censales) o una carga manual. */
export enum LocalitySource {
  GEOREF = 'GEOREF',
  MANUAL = 'MANUAL',
}

/**
 * Localidad argentina (tabla histórica `cities`; en la API, "locality").
 * El catálogo nacional sale de Georef (`npm run geo:import`): estar en el
 * catálogo NO significa que haya profesionales ahí. Nunca se identifica una
 * localidad solo por su nombre: id (uuid), código oficial o (provincia, slug).
 */
@Entity('cities')
@Index(['provinceId', 'slug'], { unique: true })
export class City {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  /** Único dentro de la provincia y estable (URLs). Un homónimo en la misma provincia lleva el departamento. */
  @Column({ length: 120 })
  slug: string;

  /** Nombre de la provincia (legacy, se mantiene igual a `provinceRef.name`). */
  @Column({ length: 120 })
  province: string;

  @Column('uuid')
  provinceId: string;

  @ManyToOne(() => Province, (p) => p.localities, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'province_id' })
  provinceRef: Province;

  /** Código oficial de localidad censal (Georef, 8 dígitos). null = cargada a mano, sin vincular todavía. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  officialCode: string | null;

  /** Departamento / partido (desambigua homónimos: "El Rincón (Caucete)"). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  departmentName: string | null;

  /** `normalizePlaceText(name)`: búsqueda sin tildes ni mayúsculas. */
  @Column({ length: 160 })
  searchName: string;

  /**
   * Centroide de la LOCALIDAD según el catálogo oficial (dato público, no de una
   * persona). Solo orienta al proveedor de direcciones; nunca es una ubicación privada.
   */
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numeric })
  centroidLat: number | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: numeric })
  centroidLng: number | null;

  @Column({ type: 'varchar', length: 24, default: LocalitySource.MANUAL })
  source: LocalitySource;

  @Column({ default: true })
  active: boolean;

  @OneToMany(() => Zone, (zone) => zone.city)
  zones: Zone[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
