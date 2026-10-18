import { resolveProfessionalEntitlements } from '../plans/plan';
import { normalizeSpecialties, ServiceSpecialties } from './service-specialties';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { ReviewKind, ReviewsQueryDto } from '../reviews/dto/reviews-query.dto';
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
import { listWorkPhotos, listWorks, presentPublicWorks } from './work-photos/work-photo.presenter';
import { WorkPhotosService } from './work-photos/work-photos.service';
import { WorkCover, workCoversFor } from './work-photos/work-covers';
import { arrangeFeatured, rotationKey } from '../plans/featured-placement';
import { EFFECTIVE_PRO_SQL } from '../plans/plan';
import {
  monthlyOpportunityStats,
  freeQuoteUsage,
  presentQuoteUsage,
  quoteLimitFor,
} from '../plans/quote-quota';
import { findOffer, offerReason, presentIntroOffer } from '../plans/pro-offers';
import {
  acknowledgeProTrialSummary,
  presentProTrial,
  proTrialSummary,
  startProTrial,
} from '../plans/pro-trial';
import {
  COVERS_LOCALITY_SQL,
  FEATURED_ELIGIBLE_SQL,
  HAS_COVERAGE_SQL,
  HAS_PUBLIC_SERVICE_SQL,
  TAKING_URGENCIES_SQL,
  VALID_LICENSE_SQL,
  isPublicProfile,
} from './professional-rules';
import { hasPendingSuggestion, presentPublication } from './publication';
import { activateReferral, pendingReferralCelebration } from '../acquisition/referrals';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent, recordProfileCompletedIfReady } from '../funnel/funnel';
import { ProfessionalService } from './professional-service.entity';
import { applyLegacyCoverage, loadCoverage, saveCoverage } from './coverage';
import { HAS_DIRECT_CONTACT_SQL } from './contact/contact-rules';

/** Reseñas por página en el perfil público. */
export const REVIEWS_PAGE_SIZE = 10;

/** PRO vigente que puede ocupar un espacio destacado (mismas reglas públicas que el resto). */
const FEATURED_CANDIDATE_SQL = `(${EFFECTIVE_PRO_SQL} AND ${FEATURED_ELIGIBLE_SQL})`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FULL_RELATIONS = {
  user: true,
  services: { service: true },
  serviceAreas: { zone: true },
  localities: { city: { provinceRef: true } },
  primaryCity: { provinceRef: true },
  verifications: true,
} as const;

/** Máximo de perfiles en el sitemap (el protocolo admite 50.000 por archivo). */
const SITEMAP_LIMIT = 5000;

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
  ): Promise<
    Paginated<
      ReturnType<typeof presentPublicProfessional> & { isFeaturedPlacement: boolean; workCovers: WorkCover[] }
    >
  > {
    const today = businessToday();
    const base = this.profiles.createQueryBuilder('p').innerJoin('p.user', 'u');

    // Solo perfiles activos (PAUSED no aparece en búsquedas nuevas).
    base.andWhere('p.status = :activeStatus', { activeStatus: ProfessionalStatus.ACTIVE });
    // Un perfil sin ningún oficio aprobado (alta con un oficio sugerido) no se publica.
    base.andWhere(HAS_PUBLIC_SERVICE_SQL);
    const serviceMatch = q.service ? (UUID.test(q.service) ? 's.id = :service' : 's.slug = :service') : null;
    if (q.service) {
      // Ofrece el servicio (activo). La matrícula no restringe: se filtra aparte con `licenseVerified`.
      base.andWhere(
        `EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active AND ${serviceMatch})`,
        { service: q.service },
      );
    }
    if (q.locality) {
      // Primero la localidad: solo quienes la cubren (toda la ciudad o algún barrio activo de ella).
      // Todo lo que sigue (servicio, barrio, urgencias, destacados, total) queda dentro de esta ciudad.
      base.andWhere(COVERS_LOCALITY_SQL(':locality', null), { locality: q.locality });
    }
    if (q.zone) {
      // Barrio activo (de la localidad buscada, si vino) + la localidad del barrio la cubre
      // entera o cubre ese barrio. Un slug de barrio sin localidad matchea en cualquier ciudad (legacy).
      base.andWhere(
        `EXISTS (SELECT 1 FROM zones z
                  WHERE ${UUID.test(q.zone) ? 'z.id = :zone' : 'z.slug = :zone'} AND z.active
                    ${q.locality ? 'AND z.city_id = :locality' : ''}
                    AND EXISTS (SELECT 1 FROM professional_localities zpl
                                 WHERE zpl.professional_id = p.id AND zpl.city_id = z.city_id
                                   AND (zpl.covers_entire_city OR EXISTS (
                                         SELECT 1 FROM professional_service_areas psa
                                          WHERE psa.professional_id = p.id AND psa.zone_id = z.id))))`,
        { zone: q.zone, ...(q.locality ? { locality: q.locality } : {}) },
      );
    }
    if (q.availableToday) base.andWhere(TAKING_URGENCIES_SQL);
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

    // Orden orgánico "recomendados": atienden urgencias, mejor valorados, más reseñas.
    // En urgencias (todos las atienden) primero quienes se pueden contactar al toque
    // (WhatsApp o llamadas); nadie queda afuera por no tenerlos.
    // Se traen todos los ids que cumplen (con localidad: decenas o cientos) para
    // ubicar los destacados PRO sin romper la paginación.
    const ordered = base
      .clone()
      .select('p.id', 'id')
      .addSelect(FEATURED_CANDIDATE_SQL, 'pro')
      .addSelect(TAKING_URGENCIES_SQL, 'available_now')
      .orderBy('available_now', 'DESC');
    if (q.availableToday) ordered.addSelect(HAS_DIRECT_CONTACT_SQL, 'direct').addOrderBy('direct', 'DESC');
    // Órdenes elegidos por el cliente: con datos primero (sin reseñas o sin tiempo de
    // respuesta, al final, nunca como 0). Ninguno mira el plan.
    if (q.sort === 'rating') {
      ordered
        .addSelect('(p.reviews_count > 0)', 'has_reviews')
        .orderBy('has_reviews', 'DESC')
        .addOrderBy('p.average_rating', 'DESC')
        .addOrderBy('p.reviews_count', 'DESC');
    } else if (q.sort === 'reviews') {
      ordered.orderBy('p.reviews_count', 'DESC').addOrderBy('p.average_rating', 'DESC');
    } else if (q.sort === 'response') {
      ordered
        .orderBy('p.average_response_minutes', 'ASC', 'NULLS LAST')
        .addOrderBy('p.average_rating', 'DESC')
        .addOrderBy('p.reviews_count', 'DESC');
    } else {
      ordered.addOrderBy('p.average_rating', 'DESC').addOrderBy('p.reviews_count', 'DESC');
    }
    const rows: { id: string; pro: boolean }[] = await ordered.addOrderBy('p.id', 'ASC').getRawMany();

    // Con `pro` todos son PRO: no hay espacios pagos que ubicar; el orden rota por día
    // (estable mientras se pagina) para que la vitrina no muestre siempre a los mismos.
    // La rotación (y por lo tanto qué PRO ocupa cada espacio) depende de la localidad: nunca se mezcla entre ciudades.
    const seed = [today, q.locality, q.service, q.zone].map((v) => v ?? '').join('|');
    const arranged = q.sort === 'organic'
      ? { ids: rows.map((r) => r.id), featured: new Set<string>() }
      : q.pro
      ? {
          ids: rows.map((r) => r.id).sort((a, b) => rotationKey(seed, a).localeCompare(rotationKey(seed, b))),
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
    const items = ids.map((id) => presentPublicProfessional(byId.get(id)!));
    // Fotos en la tarjeta: presentación de PRO (portadas de hasta 3 trabajos), una consulta por página.
    const covers = await workCoversFor(
      this.dataSource.manager,
      items.filter((p) => p.pro).map((p) => p.id),
    );
    return {
      items: items.map((p) => ({
        ...p,
        /** Espacio pago identificado: el frontend lo muestra como "Destacado". */
        isFeaturedPlacement: arranged.featured.has(p.id),
        /** Portadas de sus trabajos: solo PRO vigente; vacío para el resto. */
        workCovers: p.pro ? (covers.get(p.id) ?? []) : [],
      })),
      page: q.page,
      pageSize: q.pageSize,
      total: rows.length,
    };
  }

  /**
   * Perfiles indexables para el sitemap: activos, con un servicio que pueden ofrecer públicamente y
   * cobertura en alguna localidad. Solo slug y fecha: nada privado. Tope duro por si crece.
   */
  async listIndexable(): Promise<{ slug: string; updatedAt: string }[]> {
    const rows: { slug: string; updated_at: Date }[] = await this.profiles
      .createQueryBuilder('p')
      .select('p.slug', 'slug')
      .addSelect('p.updated_at', 'updated_at')
      .where('p.status = :active', { active: ProfessionalStatus.ACTIVE })
      .andWhere('p.slug IS NOT NULL')
      .andWhere(
        `EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active)`,
      )
      .andWhere(HAS_COVERAGE_SQL)
      .orderBy('p.updated_at', 'DESC')
      .limit(SITEMAP_LIMIT)
      .getRawMany();
    return rows.map((r) => ({ slug: r.slug, updatedAt: new Date(r.updated_at).toISOString() }));
  }

  async getPublic(id: string, bySlug = false) {
    if (!bySlug && !UUID.test(id)) throw AppException.notFound('Profesional');
    const profile = await this.profiles.findOne({
      where: bySlug ? { slug: id } : { id },
      relations: FULL_RELATIONS,
    });
    // Legacy UUID links keep their visibility contract; stable public links survive pausing.
    if (!profile || (!bySlug && !isPublicProfile(profile))) throw AppException.notFound('Profesional');
    // Sin ningún oficio aprobado todavía no hay nada que publicar (ni siquiera por enlace).
    if (!(profile.services ?? []).some((s) => s.service?.active)) throw AppException.notFound('Profesional');
    id = profile.id;

    // Persist reversible archival when the effective plan has downgraded.
    await this.workPhotos.ensurePlanArchive(profile);

    const [firstPage, invitedPage, distribution, invited, works, workPhotos] = await Promise.all([
      this.findReviews(id, 1, REVIEWS_PAGE_SIZE, 'verified'),
      this.findReviews(id, 1, REVIEWS_PAGE_SIZE, 'invited'),
      this.reviews
        .createQueryBuilder('r')
        .select('r.rating', 'stars')
        .addSelect('COUNT(*)::int', 'count')
        .where('r.professional_id = :id AND r.verified_work = true AND r.hidden_at IS NULL', { id })
        .groupBy('r.rating')
        .getRawMany<{ stars: number; count: number }>(),
      this.reviews
        .createQueryBuilder('r')
        .select('COUNT(*)::int', 'count')
        .addSelect('ROUND(AVG(r.rating)::numeric, 2)', 'average')
        .where('r.professional_id = :id AND r.verified_work = false AND r.hidden_at IS NULL', { id })
        .getRawOne<{ count: number; average: string | null }>(),
      listWorks(this.dataSource.manager, id),
      listWorkPhotos(this.dataSource.manager, id),
    ]);

    return {
      ...presentPublicProfessional(profile),
      /** "Trabajos realizados": trabajos activos con fotos, del más reciente al más viejo. Vacío = sin sección. */
      works: presentPublicWorks(works, workPhotos, resolveProfessionalEntitlements(profile)),
      ratingDistribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.find((d) => Number(d.stars) === stars)?.count ?? 0,
      })),
      /** Primera página (más recientes); el resto, en GET /professionals/:id/reviews. */
      reviews: firstPage.map(presentPublicReview),
      /**
       * Reseñas de clientes que el profesional invitó (no contrataron por Resuelve): se muestran
       * aparte y NO entran en `averageRating`, `reviewsCount` ni en el orden de la búsqueda.
       */
      invitedReviewsCount: invited?.count ?? 0,
      invitedAverageRating: invited?.count ? Number(invited.average) : null,
      invitedReviews: invitedPage.map(presentPublicReview),
    };
  }

  /** Reseñas públicas paginadas, más recientes primero (sin ocultar críticas). */
  async listReviews(
    id: string,
    q: ReviewsQueryDto,
    bySlug = false,
  ): Promise<Paginated<ReturnType<typeof presentPublicReview>>> {
    const profile = await this.profiles.findOne({ where: bySlug ? { slug: id } : { id } });
    if (!profile || (!bySlug && !isPublicProfile(profile))) throw AppException.notFound('Profesional');
    id = profile.id;
    const [items, total] = await Promise.all([
      this.findReviews(id, q.page, q.pageSize, q.kind),
      this.reviews.countBy({ professionalId: id, verifiedWork: q.kind === 'verified', hiddenAt: IsNull() }),
    ]);
    return { items: items.map(presentPublicReview), page: q.page, pageSize: q.pageSize, total };
  }

  private findReviews(
    professionalId: string,
    page: number,
    pageSize: number,
    kind: ReviewKind,
  ): Promise<Review[]> {
    return this.reviews.find({
      where: { professionalId, verifiedWork: kind === 'verified', hiddenAt: IsNull() },
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
        const used = await freeQuoteUsage(m, locked.id);
        if (!(await offerReason(m, offer, locked, used, this.config)))
          patch.proInterestOfferCode = offer.code;
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
    const used = await freeQuoteUsage(m, profile.id);
    const limit = quoteLimitFor(profile, this.config);
    const opportunityStats = await monthlyOpportunityStats(m, profile.id, limit !== null && used >= limit);
    return {
      ...presentOwnProfessional(
        profile,
        { ...presentQuoteUsage(used, limit), ...opportunityStats },
        await presentIntroOffer(m, profile, used, this.config),
        this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
      ),
      /** Qué falta para que se publique (un oficio sugerido sin aprobar, cobertura, pausa). */
      publication: await presentPublication(m, profile),
      /** Premio de referidos todavía sin festejar (el panel lo muestra una vez). */
      referralCelebration: await pendingReferralCelebration(m, profile.id, this.config),
      /** Prueba de PRO (`plans/pro-trial.ts`): disponible, en curso o terminada con su resumen pendiente. */
      proTrial: await presentProTrial(m, profile, this.config),
    };
  }

  /** "Probar PRO": activa la prueba (una vez, sin tarjeta) y devuelve /pro/me con el plan nuevo. */
  async startProTrial(profile: ProfessionalProfile) {
    await this.dataSource.transaction((m) => startProTrial(m, profile.id, this.config));
    return this.getOwn(profile.id);
  }

  /** Resumen de la prueba ya terminada con sus números reales. 404 si no tuvo prueba o sigue en curso. */
  async proTrialSummary(profile: ProfessionalProfile) {
    const summary = await proTrialSummary(this.dataSource.manager, profile.id);
    if (!summary) throw AppException.notFound('Resumen de la prueba');
    return summary;
  }

  /** Cerró el resumen: el panel no lo vuelve a abrir solo. */
  async acknowledgeProTrialSummary(profile: ProfessionalProfile) {
    await acknowledgeProTrialSummary(this.dataSource.manager, profile.id);
    return this.getOwn(profile.id);
  }

  async startOnboarding(userId: string) {
    const [row] = await this.dataSource.query<{ professionalIntentAt: Date }[]>(
      `UPDATE users SET professional_intent_at = COALESCE(professional_intent_at, now()) WHERE id = $1 RETURNING professional_intent_at AS "professionalIntentAt"`, [userId]);
    return row;
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
            yearsExperience: dto.yearsExperience ?? null,
            takesUrgencies: dto.availableToday ?? false,
          }),
        );
        // Sin oficios en el catálogo solo se puede crear con un oficio sugerido en revisión:
        // el perfil queda sin publicar hasta que se apruebe (`publicationBlockers`).
        if (!dto.serviceIds.length && !(await hasPendingSuggestion(m, userId)))
          throw AppException.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            'Elegí al menos un servicio o sugerí tu oficio para continuar.',
          );
        await this.replaceServices(m, profile.id, dto.serviceIds, dto.specialties ?? undefined);
        await this.writeCoverage(m, profile, dto, true);
        await recordFunnelEvent(m, {
          type: FunnelEventType.PROFESSIONAL_REGISTERED,
          professionalId: profile.id,
        });
        await recordProfileCompletedIfReady(m, profile.id);
        // Llegó por el enlace de un colega: con el perfil creado, los dos suman días de PRO.
        await activateReferral(m, profile.id, this.config);
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
      // Serializa cambios de servicios/especialidades del mismo perfil.
      await m.findOneOrFail(ProfessionalProfile, {
        where: { id: profile.id },
        lock: { mode: 'pessimistic_write' },
      });
      const patch: Partial<ProfessionalProfile> = {};
      if (dto.headline !== undefined) patch.headline = dto.headline;
      if (dto.bio !== undefined) patch.bio = dto.bio;
      if (dto.yearsExperience !== undefined) patch.yearsExperience = dto.yearsExperience;
      if (Object.keys(patch).length) await m.update(ProfessionalProfile, profile.id, patch);
      // Quitar un servicio solo lo saca de búsquedas: solicitudes, presupuestos y
      // verificaciones viejas no dependen de esta tabla.
      if (dto.serviceIds || dto.specialties) {
        const ids =
          dto.serviceIds ??
          (await m.findBy(ProfessionalService, { professionalId: profile.id })).map((s) => s.serviceId);
        await this.replaceServices(m, profile.id, ids, dto.specialties);
      }
      // La cobertura cambia solo si viene; "toda la ciudad" conserva los barrios (se ignoran).
      if (dto.coverage || dto.coversEntireCity !== undefined || dto.zoneIds || dto.primaryLocalityId) {
        const current = await m.findOneByOrFail(ProfessionalProfile, { id: profile.id });
        await this.writeCoverage(m, current, dto);
      }
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
    // Permanente: queda así hasta que el profesional lo vuelva a cambiar.
    await this.profiles.update(profile.id, { takesUrgencies: dto.availableToday });
    return this.getOwn(profile.id);
  }

  private async replaceServices(
    m: EntityManager,
    professionalId: string,
    serviceIds: string[],
    specialties: ServiceSpecialties[] = [],
  ): Promise<void> {
    if (!serviceIds.length) {
      await m.delete(ProfessionalService, { professionalId });
      return;
    }
    const count = await m.countBy(Service, { id: In(serviceIds), active: true });
    if (count !== serviceIds.length)
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Algún servicio no existe');
    const names = normalizeSpecialties(specialties, serviceIds);
    const previous = new Map(
      (await m.findBy(ProfessionalService, { professionalId })).map((s) => [s.serviceId, s.specialties]),
    );
    await m.delete(ProfessionalService, { professionalId });
    await m.insert(
      ProfessionalService,
      serviceIds.map((serviceId) => ({
        professionalId,
        serviceId,
        specialties: names.get(serviceId) ?? previous.get(serviceId) ?? [],
      })),
    );
  }

  /**
   * `coverage` (multiciudad) reemplaza todo; si no, el contrato legacy de una ciudad
   * (`coversEntireCity`/`zoneIds`); si solo cambia `primaryLocalityId`, se reordena.
   */
  private async writeCoverage(
    m: EntityManager,
    profile: Pick<ProfessionalProfile, 'id' | 'primaryCityId'>,
    dto: CreateProfessionalProfileDto | UpdateProfessionalProfileDto,
    creating = false,
  ): Promise<void> {
    if (dto.coverage) return saveCoverage(m, profile.id, dto.coverage, dto.primaryLocalityId);
    // Al crear siempre se valida: un perfil nuevo sin cobertura no se publica.
    if (dto.coversEntireCity !== undefined || dto.zoneIds || creating) {
      await applyLegacyCoverage(
        m,
        profile,
        { coversEntireCity: dto.coversEntireCity, zoneIds: dto.zoneIds },
        this.config.get<string>('LEGACY_LOCALITY', 'buenos-aires/tandil'),
      );
    }
    if (dto.primaryLocalityId) {
      await saveCoverage(m, profile.id, await loadCoverage(m, profile.id), dto.primaryLocalityId);
    }
  }
}
