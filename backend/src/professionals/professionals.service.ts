import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { businessToday } from '../common/time';
import { Review } from '../reviews/review.entity';
import {
  AvailabilityDto,
  CreateProfessionalProfileDto,
  ProfileStatusDto,
  SearchProfessionalsDto,
  UpdateProfessionalProfileDto,
} from './dto/professional.dto';
import { ProfessionalProfile } from './professional-profile.entity';
import { presentOwnProfessional, presentPublicProfessional } from './professional.presenter';
import { FREE_MONTHLY_REQUEST_LIMIT, ProfessionalStatus } from './professional.enums';
import { OFFERS_PUBLICLY_SQL, VALID_LICENSE_SQL, isPublicProfile } from './professional-rules';
import { ProfessionalServiceArea } from './professional-service-area.entity';
import { ProfessionalService } from './professional-service.entity';

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
  ) {}

  // ---- Público ------------------------------------------------------------

  async search(q: SearchProfessionalsDto): Promise<Paginated<ReturnType<typeof presentPublicProfessional>>> {
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
    if (q.minRating !== undefined)
      base.andWhere('p.average_rating >= :minRating', { minRating: q.minRating });

    const total = await base.clone().getCount();
    // Orden "recomendados" (igual que el frontend): disponibles hoy, mejor valorados, más reseñas.
    const rows: { id: string }[] = await base
      .clone()
      .select('p.id', 'id')
      .addSelect('(p.available_today AND p.available_on = :today)', 'available_now')
      .setParameter('today', today)
      .orderBy('available_now', 'DESC')
      .addOrderBy('p.average_rating', 'DESC')
      .addOrderBy('p.reviews_count', 'DESC')
      .addOrderBy('p.id', 'ASC')
      .offset((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .getRawMany();

    const ids = rows.map((r) => r.id);
    const found = ids.length
      ? await this.profiles.find({ where: { id: In(ids) }, relations: FULL_RELATIONS })
      : [];
    const byId = new Map(found.map((p) => [p.id, p]));
    return {
      items: ids.map((id) => presentPublicProfessional(byId.get(id)!)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async getPublic(id: string) {
    if (!UUID.test(id)) throw AppException.notFound('Profesional');
    const profile = await this.profiles.findOne({
      where: { id },
      relations: { ...FULL_RELATIONS, portfolio: { zone: true } },
    });
    // Pausado = oculto: mismo 404 que uno inexistente.
    if (!profile || !isPublicProfile(profile)) throw AppException.notFound('Profesional');

    const [recentReviews, distribution] = await Promise.all([
      this.reviews.find({
        where: { professionalId: id },
        relations: { client: true, request: { service: true, zone: true } },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.reviews
        .createQueryBuilder('r')
        .select('r.rating', 'stars')
        .addSelect('COUNT(*)::int', 'count')
        .where('r.professional_id = :id', { id })
        .groupBy('r.rating')
        .getRawMany<{ stars: number; count: number }>(),
    ]);

    return {
      ...presentPublicProfessional(profile),
      portfolio: [...(profile.portfolio ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          id: item.id,
          title: item.title,
          imageUrl: item.imageUrl,
          zone: item.zone?.name ?? null,
          verifiedWork: !!item.requestId,
        })),
      ratingDistribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.find((d) => Number(d.stars) === stars)?.count ?? 0,
      })),
      reviews: recentReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        verifiedWork: r.verifiedWork,
        // Solo nombre e inicial: el apellido completo del cliente no es público.
        author: `${r.client.firstName} ${r.client.lastName.charAt(0)}.`,
        zone: r.request.zone?.name ?? null,
        service: r.request.service?.name ?? null,
        createdAt: r.createdAt,
      })),
    };
  }

  // ---- Profesional autenticado ------------------------------------------

  async getOwn(profileId: string) {
    const profile = await this.profiles.findOneOrFail({
      where: { id: profileId },
      relations: FULL_RELATIONS,
    });
    return presentOwnProfessional(profile, FREE_MONTHLY_REQUEST_LIMIT);
  }

  async create(userId: string, dto: CreateProfessionalProfileDto) {
    let id: string;
    try {
      id = await this.dataSource.transaction(async (m) => {
        if (await m.existsBy(ProfessionalProfile, { userId })) {
          throw AppException.conflict(ErrorCode.PROFESSIONAL_PROFILE_EXISTS, 'Ya tenés un perfil profesional');
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
    });
    return this.getOwn(profile.id);
  }

  /** Pausar / reactivar el perfil. No toca disponibilidad, servicios ni historial. */
  async setStatus(profile: ProfessionalProfile, dto: ProfileStatusDto) {
    await this.profiles.update(profile.id, { status: dto.status });
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
