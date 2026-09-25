import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';

/** Oficio/servicio concreto (Electricidad, Plomería…). Vive en la base, no en un enum. */
@Entity('services')
@Index(['slug'], { unique: true })
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.services, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120 })
  slug: string;

  /** Gas y electricidad exigen matrícula para poder verificarla. */
  @Column({ default: false })
  requiresLicense: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: true })
  active: boolean;
}
