import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from '../catalog/city.entity';
import { User } from '../users/user.entity';
import { PlanTier, ProfessionalStatus } from './professional.enums';
import { ProfessionalService } from './professional-service.entity';
import { ProfessionalLocality } from './professional-locality.entity';
import { ProfessionalServiceArea } from './professional-service-area.entity';
import { ProfessionalVerification } from './professional-verification.entity';

/**
 * "Modo profesional" de un usuario (relación 1:1 opcional).
 * Las métricas (rating, reseñas, trabajos) las calcula el backend a partir
 * de datos reales; ningún endpoint permite escribirlas.
 */
@Entity('professional_profiles')
@Check('ck_professional_profiles_rating', '"average_rating" >= 0 AND "average_rating" <= 5')
export class ProfessionalProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 190, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  referralCode: string;

  @Column({ type: 'timestamptz', nullable: true })
  bonusProUntil: Date | null;

  /** Único: lo garantiza la relación 1:1 (constraint REL_… en la migración). */
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (user) => user.professionalProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Título público: "Electricista matriculado". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'smallint', default: 0 })
  yearsExperience: number;

  /**
   * LEGACY (modelo de una sola ciudad): espejo de `coversEntireCity` de la
   * localidad principal, para que un backend anterior siga funcionando en un
   * rollback. La fuente de verdad es `professional_localities`; no leerlo.
   */
  @Column({ default: false })
  coversEntireCity: boolean;

  /** Ciudad principal (una de las que cubre). null = perfil sin cobertura cargada. */
  @Column({ type: 'uuid', nullable: true })
  primaryCityId: string | null;

  @ManyToOne(() => City, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'primary_city_id' })
  primaryCity: City | null;

  @OneToMany(() => ProfessionalLocality, (l) => l.professional)
  localities: ProfessionalLocality[];

  @Column({
    type: 'enum',
    enum: ProfessionalStatus,
    enumName: 'professional_status',
    default: ProfessionalStatus.ACTIVE,
  })
  status: ProfessionalStatus;

  /**
   * "Tomo urgencias" hasta este instante (`URGENT_AVAILABILITY_HOURS` desde que lo
   * prendió o lo extendió). null o pasado = no toma urgencias. Ver `isTakingUrgencies`.
   */
  @Column({ type: 'timestamptz', nullable: true })
  availableUntil: Date | null;

  @Column({ type: 'integer', nullable: true })
  averageResponseMinutes: number | null;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  averageRating: number;

  @Column({ default: 0 })
  reviewsCount: number;

  /** Reseñas de clientes invitados visibles. Solo se muestra aparte: nunca entra en rating ni orden. */
  @Column({ default: 0 })
  invitedReviewsCount: number;

  @Column({ default: 0 })
  completedJobsCount: number;

  @Column({ type: 'enum', enum: PlanTier, enumName: 'plan_tier', default: PlanTier.FREE })
  planTier: PlanTier;

  /**
   * Vencimiento de un PRO temporal (fundadores, prueba manual). null = sin
   * vencimiento. Vencido, el plan efectivo es FREE (ver `effectivePlan`); no se borra nada.
   */
  @Column({ type: 'timestamptz', nullable: true })
  planExpiresAt: Date | null;

  /**
   * Cuándo pidió Resuelve PRO desde la app ("Quiero PRO"). Sin billing no
   * cambia el plan: solo deja registrado el interés para activarlo a mano
   * (`npm run plan:set -- list`). null = nunca lo pidió.
   */
  @Column({ type: 'timestamptz', nullable: true })
  proInterestAt: Date | null;

  /**
   * Oferta con la que pidió PRO (p. ej. `PRO_FIRST_MONTH_20`), solo si era
   * elegible al pedirlo: la deja reservada aunque el mes siguiente el cupo
   * vuelva a 0. null = sin oferta.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  proInterestOfferCode: string | null;

  /**
   * Primera vez que tuvo PRO pago (`plan:set --plan PRO` sin `--courtesy`, o
   * al redimir una oferta). Nunca se borra: si vuelve a Free no recupera la
   * oferta de bienvenida. null = nunca pagó PRO.
   */
  @Column({ type: 'timestamptz', nullable: true })
  firstPaidProAt: Date | null;

  /**
   * PRO por billing (Mercado Pago): hasta cuándo da acceso la suscripción,
   * derivado en `billing/billing-rules.ts` (renovación + gracia, período pago
   * tras cancelar). Lo escribe SOLO la reconciliación de billing; es
   * independiente de `planTier`/`planExpiresAt` (PRO manual), así un webhook
   * nunca baja un PRO manual ni `plan:set` pisa una suscripción. null = sin PRO por billing.
   */
  @Column({ type: 'timestamptz', nullable: true })
  billingProUntil: Date | null;

  /**
   * PRO pagado por transferencia: fin del último período aprobado por un admin
   * (`billing/transfer/`). Lo escriben SOLO la aprobación y el arrepentimiento de
   * una transferencia; independiente de billing, del PRO manual y del bonus.
   * null = sin PRO por transferencia.
   */
  @Column({ type: 'timestamptz', nullable: true })
  transferProUntil: Date | null;

  /**
   * Primer éxito: la primera vez que un cliente aceptó un presupuesto suyo
   * (evento objetivo, no depende de que el profesional marque nada). Se
   * escribe una sola vez (`UPDATE … WHERE first_success_at IS NULL`) y nunca
   * vuelve a null. Hasta entonces corre la "Prueba PRO" (`plans/plan.ts`).
   */
  @Column({ type: 'timestamptz', nullable: true })
  firstSuccessAt: Date | null;

  /** null hasta que el profesional elige PRO o seguir Free en la celebración. */
  @Column({ type: 'timestamptz', nullable: true })
  firstSuccessCelebratedAt: Date | null;

  /**
   * Foto de perfil pública (Cloudinary, carpeta `resuelve/avatars/<id>`).
   * `avatarPublicId` sirve para reemplazarla o borrarla; `avatarUrl` es la URL
   * de entrega cuadrada que muestran perfil, resultados y presupuestos. Una
   * foto NO es una verificación de identidad. null = iniciales.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  avatarPublicId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @OneToMany(() => ProfessionalService, (ps) => ps.professional)
  services: ProfessionalService[];

  @OneToMany(() => ProfessionalServiceArea, (area) => area.professional)
  serviceAreas: ProfessionalServiceArea[];

  @OneToMany(() => ProfessionalVerification, (v) => v.professional)
  verifications: ProfessionalVerification[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
