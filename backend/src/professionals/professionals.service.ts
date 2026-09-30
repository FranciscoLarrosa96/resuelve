import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated, PaginationQueryDto } from '../common/pagination/pagination';
import { businessToday } from '../common/time';
import { Review } from '../reviews/review.entity';
import { presentPublicReview } from '../reviews/review.presenter';
import {
  AvailabilityDto,
  CreateProfessionalProfileDto,
  ProfileStatusDto,
  SearchProfessionalsDto,
  UpdateProfessionalProfileDto,
} from './dto/professional.dto';
import { ProfessionalProfile } from './professional-profile.entity';
import { presentOwnProfessional, presentPublicProfessional } from './professional.presenter';
import { ProfessionalStatus } from './professional.enums';
import { listWorkPhotos, presentPublicWorkPhoto } from './work-photos/work-photo.presenter';
import { WorkPhotosService } from './work-photos/work-photos.service';
import { arrangeFeatured, rotationKey } from '../plans/featured-placement';
import { EFFECTIVE_PRO_SQL } from '../plans/plan';
import {
  monthlyOpportunityStats,
  monthlyQuoteUsage,
  presentQuoteUsage,
  quoteLimitFor,
} from '../plans/quote-quota';
import { findOffer, offerReason, presentIntroOffer } from '../plans/pro-offers';
import {
  FEATURED_ELIGIBLE_SQL,
  OFFERS_PUBLICLY_SQL,
  VALID_LICENSE_SQL,
  isPublicProfile,
} from './professional-rules';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent, recordProfileCompletedIfReady } from '../funnel/funnel';
import { ProfessionalServiceArea } from './professional-service-area.entity';
import { ProfessionalService } from './professional-service.entity';

/** Reseñas por página en el perfil público. */
export const REVIEWS_PAGE_SIZE = 10;

/** PRO vigente que puede ocupar un espacio destacado (mismas reglas públicas que el resto). */
const FEATURED_CANDIDATE_SQL = `(${EFFECTIVE_PRO_SQL} AND ${FEATURED_ELIGIBLE_SQL})`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FULL_RELATIONS = {
  user: true,
  services: { service: true },
  serviceAreas: { zone: true },
  verifications: true,
} as const;

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly dataSource: DataSource,
    private readonly workPhotos: WorkPhotosService,
    private readonly config: ConfigService,
  ) {}

  // ---- Público ------------------------------------------------------------

  async search(
    q: SearchProfessionalsDto,
  ): Promise<Paginated<ReturnType<typeof presentPublicProfessional> & { isFeaturedPlacement: boolean }>> {
    const today = businessToday();
    const base = this.profiles.createQueryBuilder('p').innerJoin('p.user', 'u');

    // Solo perfiles activos (PAUSED no aparece en búsquedas nuevas).
    base.andWhere('p.status = :activeStatus', { activeStatus: ProfessionalStatus.ACTIVE });
    const serviceMatch = q.service ? (UUID.test(q.service) ? 's.id = :service' : 's.slug = :service') : null;
    if (q.service) {
      // Ofrece el servicio y puede ofrecerlo: si requiere matrícula, tiene que estar aprobada y vigente.
      base.andWhere(
        `EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active AND ${serviceMatch} AND ${OFFERS_PUBLICLY_SQL})`,
        { service: q.service },
      );
    }
    if (q.zone) {
      // Zona activa + (la cubre explícitamente o cubre toda la ciudad). Hoy hay una sola
      // ciudad; con más, "toda la ciudad" deberá comparar también z.city_id.
      base.andWhere(
        `EXISTS (SELECT 1 FROM zones z
                  WHERE ${UUID.test(q.zone) ? 'z.id = :zone' : 'z.slug = :zone'} AND z.active
                    AND (p.covers_entire_city OR EXISTS (
                          SELECT 1 FROM professional_service_areas psa
                           WHERE psa.professional_id = p.id AND psa.zone_id = z.id)))`,
        { zone: q.zone },
      );
    }
    if (q.availableToday) base.andWhere('p.available_today = true AND p.available_on = :today', { today });
    if (q.licenseVerified) {
      // Matrícula aprobada y vigente de un servicio que ofrece; con `service`, de ESE servicio.
      base.andWhere(
        `EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active AND s.requires_license
                    ${serviceMatch ? `AND ${serviceMatch}` : ''} AND ${VALID_LICENSE_SQL('s.id')})`,
        q.service ? { service: q.service } : {},
      );
    }
    // Vitrina PRO: suscripción vigente que puede ocupar un espacio destacado (perfil activo,
    // un servicio que ofrece públicamente y cobertura), además de los filtros de arriba.
    if (q.pro) base.andWhere(FEATURED_CANDIDATE_SQL);
    // Rating real: sin reseñas no hay rating, así que no cumple ningún mínimo (ni siquiera 0).
    if (q.minRating !== undefined)
      base.andWhere('p.reviews_count > 0 AND p.average_rating >= :minRating', { minRating: q.minRating });

    // Orden orgánico "recomendados": disponibles hoy, mejor valorados, más reseñas.
    // Se traen todos los ids que cumplen (una ciudad: decenas o cientos) para
    // ubicar los destacados PRO sin romper la paginación.
    const rows: { id: string; pro: boolean }[] = await base
      .clone()
      .select('p.id', 'id')
      .addSelect(FEATURED_CANDIDATE_SQL, 'pro')
      .addSelect('(p.available_today AND p.available_on = :today)', 'available_now')
      .setParameter('today', today)
      .orderBy('available_now', 'DESC')
      .addOrderBy('p.average_rating', 'DESC')
      .addOrderBy('p.reviews_count', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .getRawMany();

    // Con `pro` todos son PRO: no hay espacios pagos que ubicar; el orden rota por día
    // (estable mientras se pagina) para que la vitrina no muestre siempre a los mismos.
    const seed = [today, q.service, q.zone].map((v) => v ?? '').join('|');
    const arranged = q.pro
      ? {
          ids: rows
            .map((r) => r.id)
            .sort((a, b) => rotationKey(seed, a).localeCompare(rotationKey(seed, b))),
          featured: new Set<string>(),
        }
      : arrangeFeatured(
          rows.map((r) => r.id),
          new Set(rows.filter((r) => r.pro).map((r) => r.id)),
          {
            maxSlots: this.config.get<number>('FEATURED_SLOTS', 2),
            resultsPerSlot: this.config.get<number>('FEATURED_RESULTS_PER_SLOT', 8),
            // Rota por día y por búsqueda; estable mientras se pagina.
            seed,
          },
        );
    const ids = arranged.ids.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    const found = ids.length
      ? await this.profiles.find({ where: { id: In(ids) }, relations: FULL_RELATIONS })
      : [];
    const byId = new Map(found.map((p) => [p.id, p]));
    return {
      items: ids.map((id) => ({
        ...presentPublicProfessional(byId.get(id)!),
        /** Espacio pago identificado: el frontend lo muestra como "Destacado". */
        isFeaturedPlacement: arranged.featured.has(id),
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: rows.length,
    };
  }

  async getPublic(id: string) {
    if (!UUID.test(id)) throw AppException.notFound('Profesional');
    const profile = await this.profiles.findOne({
      where: { id },
      relations: FULL_RELATIONS,
    });
    // Pausado = oculto: mismo 404 que uno inexistente.
    if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');

    // Persist reversible archival when the effective plan has downgraded.
    await this.workPhotos.ensurePlanArchive(profile);

    const [firstPage, distribution, workPhotos] = await Promise.all([
      this.findReviews(id, 1, REVIEWS_PAGE_SIZE),
      this.reviews
        .createQueryBuilder('r')
        .select('r.rating', 'stars')
        .addSelect('COUNT(*)::int', 'count')
        .where('r.professional_id = :id', { id })
        .groupBy('r.rating')
        .getRawMany<{ stars: number; count: number }>(),
      listWorkPhotos(this.dataSource.manager, id),
    ]);

    return {
      ...presentPublicProfessional(profile),
      /** "Trabajos realizados" (0–5). Vacío = el frontend no muestra la sección. */
      workPhotos: workPhotos.filter((photo) => !photo.archivedByPlan).map(presentPublicWorkPhoto),
      ratingDistribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.find((d) => Number(d.stars) === stars)?.count ?? 0,
      })),
      /** Primera página (más recientes); el resto, en GET /professionals/:id/reviews. */
      reviews: firstPage.map(presentPublicReview),
    };
  }

  /** Reseñas públicas paginadas, más recientes primero (sin ocultar críticas). */
  async listReviews(
    id: string,
    q: PaginationQueryDto,
  ): Promise<Paginated<ReturnType<typeof presentPublicReview>>> {
    const profile = await this.profiles.findOne({ where: { id } });
    if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');
    const [items, total] = await Promise.all([
      this.findReviews(id, q.page, q.pageSize),
      this.reviews.countBy({ professionalId: id }),
    ]);
    return { items: items.map(presentPublicReview), page: q.page, pageSize: q.pageSize, total };
  }

  private findReviews(professionalId: string, page: number, pageSize: number): Promise<Review[]> {
    return this.reviews.find({
      where: { professionalId },
      relations: { client: true },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  // ---- Profesional autenticado ------------------------------------------

  /**
   * "Quiero PRO": guarda la primera fecha en que lo pidió. Idempotente; no
   * toca el plan. Con `offerCode`, la oferta queda reservada solo si HOY es
   * elegible (lo revalida el servidor); un código ajeno o vencido se ignora.
   */
  async registerProInterest(profile: ProfessionalProfile, offerCode?: string) {
    await this.dataSource.transaction(async (m) => {
      const locked = await m.findOneOrFail(ProfessionalProfile, {
        where: { id: profile.id },
        lock: { mode: 'pessimistic_write' },
      });
      const patch: Partial<ProfessionalProfile> = {};
      if (!locked.proInterestAt) patch.proInterestAt = new Date();
      const offer = offerCode ? findOffer(this.config, offerCode) : null;
      if (offer && locked.proInterestOfferCode !== offer.code) {
        const used = await monthlyQuoteUsage(m, locked.id);
        if (!(await offerReason(m, offer, locked, used, this.config))) patch.proInterestOfferCode = offer.code;
      }
      if (Object.keys(patch).length) await m.update(ProfessionalProfile, locked.id, patch);
    });
    return this.getOwn(profile.id);
  }

  /** Cierra el momento comercial sin cambiar el plan; idempotente. */
  async acknowledgeFirstSuccess(profile: ProfessionalProfile) {
    await this.profiles
      .createQueryBuilder()
      .update(ProfessionalProfile)
      .set({ firstSuccessCelebratedAt: new Date() })
      .where('id = :id AND first_success_at IS NOT NULL AND first_success_celebrated_at IS NULL', {
        id: profile.id,
      })
      .execute();
    return this.getOwn(profile.id);
  }

  async getOwn(profileId: string) {
    const profile = await this.profiles.findOneOrFail({
      where: { id: profileId },
      relations: FULL_RELATIONS,
    });
    const m = this.dataSource.manager;
    const used = await monthlyQuoteUsage(m, profile.id);
    const limit = quoteLimitFor(profile, this.config);
    const opportunityStats = await monthlyOpportunityStats(m, profile.id, limit !== null && used >= limit);
    return presentOwnProfessional(
      profile,
      { ...presentQuoteUsage(used, limit), ...opportunityStats },
      await presentIntroOffer(m, profile, used, this.config),
      this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
    );
  }

  async create(userId: string, dto: CreateProfessionalProfileDto) {
    let id: string;
    try {
      id = await this.dataSource.transaction(async (m) => {
        if (await m.existsBy(ProfessionalProfile, { userId })) {
          throw AppException.conflict(
            ErrorCode.PROFESSIONAL_PROFILE_EXISTS,
            'Ya tenés un perfil profesional',
          );
        }
        const profile = await m.save(
          m.create(ProfessionalProfile, {
            userId,
            headline: dto.headline,
            bio: dto.bio ?? null,
            yearsExperience: dto.yearsExperience,
            availableToday: dto.availableToday ?? false,
            availableOn: dto.availableToday ? businessToday() : null,
            coversEntireCity: dto.coversEntireCity ?? false,
          }),
        );
        await this.replaceServices(m, profile.id, dto.serviceIds);
        if (dto.zoneIds?.length) await this.replaceZones(m, profile.id, dto.zoneIds);
        await this.assertCoverage(m, profile.id);
        await recordFunnelEvent(m, { type: FunnelEventType.PROFESSIONAL_REGISTERED, professionalId: profile.id });
        await recordProfileCompletedIfReady(m, profile.id);
        return profile.id;
      });
    } catch (error) {
      // Dos publicaciones simultáneas pueden pasar el existsBy; la clave única en user_id decide.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505' &&
        (await this.profiles.existsBy({ userId }))
      ) {
        throw AppException.conflict(ErrorCode.PROFESSIONAL_PROFILE_EXISTS, 'Ya tenés un perfil profesional');
      }
      throw error;
    }
    return this.getOwn(id);
  }

  async update(profile: ProfessionalProfile, dto: UpdateProfessionalProfileDto) {
    await this.dataSource.transaction(async (m) => {
      const patch: Partial<ProfessionalProfile> = {};
      if (dto.headline !== undefined) patch.headline = dto.headline;
      if (dto.bio !== undefined) patch.bio = dto.bio;
      if (dto.yearsExperience !== undefined) patch.yearsExperience = dto.yearsExperience;
      if (dto.coversEntireCity !== undefined) patch.coversEntireCity = dto.coversEntireCity;
      if (Object.keys(patch).length) await m.update(ProfessionalProfile, profile.id, patch);
      // Quitar un servicio solo lo saca de búsquedas: solicitudes, presupuestos y
      // verificaciones viejas no dependen de esta tabla.
      if (dto.serviceIds) await this.replaceServices(m, profile.id, dto.serviceIds);
      // Las zonas se reemplazan solo si vienen: "Todo Tandil" las conserva (se ignoran).
      if (dto.zoneIds) await this.replaceZones(m, profile.id, dto.zoneIds);
      if (dto.coversEntireCity !== undefined || dto.zoneIds) await this.assertCoverage(m, profile.id);
      await recordProfileCompletedIfReady(m, profile.id);
    });
    return this.getOwn(profile.id);
  }

  /** Pausar / reactivar el perfil. No toca disponibilidad, servicios ni historial. */
  async setStatus(profile: ProfessionalProfile, dto: ProfileStatusDto) {
    await this.profiles.update(profile.id, { status: dto.status });
    await recordProfileCompletedIfReady(this.dataSource.manager, profile.id);
    return this.getOwn(profile.id);
  }

  async setAvailability(profile: ProfessionalProfile, dto: AvailabilityDto) {
    await this.profiles.update(profile.id, {
      availableToday: dto.availableToday,
      availableOn: dto.availableToday ? businessToday() : null,
    });
    return this.getOwn(profile.id);
  }

  private async replaceServices(
    m: EntityManager,
    professionalId: string,
    serviceIds: string[],
  ): Promise<void> {
    const count = await m.countBy(Service, { id: In(serviceIds), active: true });
    if (count !== serviceIds.length)
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Algún servicio no existe');
    await m.delete(ProfessionalService, { professionalId });
    await m.insert(
      ProfessionalService,
      serviceIds.map((serviceId) => ({ professionalId, serviceId })),
    );
  }

  /** Sin "Todo Tandil" hace falta al menos una zona activa. */
  private async assertCoverage(m: EntityManager, professionalId: string): Promise<void> {
    const profile = await m.findOneByOrFail(ProfessionalProfile, { id: professionalId });
    if (profile.coversEntireCity) return;
    const zones = await m
      .createQueryBuilder(ProfessionalServiceArea, 'psa')
      .innerJoin('psa.zone', 'z')
      .where('psa.professional_id = :id AND z.active', { id: professionalId })
      .getCount();
    if (!zones)
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'Elegí al menos un barrio o marcá que trabajás en todo Tandil',
        { fields: ['zoneIds'] },
      );
  }

  private async replaceZones(m: EntityManager, professionalId: string, zoneIds: string[]): Promise<void> {
    const count = await m.countBy(Zone, { id: In(zoneIds), active: true });
    if (count !== zoneIds.length)
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Alguna zona no existe');
    await m.delete(ProfessionalServiceArea, { professionalId });
    await m.insert(
      ProfessionalServiceArea,
      zoneIds.map((zoneId) => ({ professionalId, zoneId })),
    );
  }
}
