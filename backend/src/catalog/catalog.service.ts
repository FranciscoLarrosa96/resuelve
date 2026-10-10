import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Category } from './category.entity';
import { City } from './city.entity';
import { Service } from './service.entity';
import { Zone } from './zone.entity';
import { POPULAR_WINDOW_DAYS, selectPopularSlugs } from './popular-services';
import { ServicesQueryDto, ZonesQueryDto } from './dto/catalog-query.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const presentService = (s: Service) => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  categoryId: s.categoryId,
  requiresLicense: s.requiresLicense,
});

export const presentZone = (z: Zone) => ({ id: z.id, name: z.name, slug: z.slug, cityId: z.cityId });

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(City) private readonly cities: Repository<City>,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
    private readonly dataSource: DataSource,
  ) {}

  private popularCache: { at: number; slugs: string[] } | null = null;

  async listCategories() {
    const list = await this.categories
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.services', 's', 's.active = true')
      .where('c.active = true')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('s.sortOrder', 'ASC')
      .getMany();
    return list.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      services: c.services.map(presentService),
    }));
  }

  async listServices(query: ServicesQueryDto) {
    const qb = this.services
      .createQueryBuilder('s')
      .innerJoin('s.category', 'c')
      .where('s.active = true AND c.active = true')
      .orderBy('c.sortOrder', 'ASC')
      .addOrderBy('s.sortOrder', 'ASC');
    if (query.category) qb.andWhere('c.slug = :category', { category: query.category });
    if (query.q) {
      // unaccent no está garantizado en todos los hostings: comparamos en minúsculas.
      qb.andWhere('(lower(s.name) LIKE :q OR lower(c.name) LIKE :q)', {
        q: `%${query.q.toLowerCase().replace(/[%_]/g, '')}%`,
      });
    }
    return (await qb.getMany()).map(presentService);
  }

  /**
   * Servicios más pedidos (pedidos enviados de los últimos 90 días), solo slugs:
   * sin cantidades ni datos de nadie. Vacío si todavía no hay volumen. Cache corto.
   */
  async listPopularSlugs(): Promise<string[]> {
    const now = Date.now();
    if (this.popularCache && now - this.popularCache.at < 10 * 60_000) return this.popularCache.slugs;
    const rows = await this.dataSource.query<{ slug: string; count: string }[]>(
      `SELECT s.slug AS slug, COUNT(*)::text AS count
         FROM service_requests r
         JOIN services s ON s.id = r.service_id
        WHERE s.active AND r.status <> 'DRAFT'
          AND r.created_at >= now() - ($1::int * interval '1 day')
        GROUP BY s.slug`,
      [POPULAR_WINDOW_DAYS],
    );
    const slugs = selectPopularSlugs(rows.map((r) => ({ slug: r.slug, count: Number(r.count) })));
    this.popularCache = { at: now, slugs };
    return slugs;
  }

  /** Acepta id (uuid) o slug. */
  async getService(idOrSlug: string) {
    const service = await this.services.findOne({
      where: UUID.test(idOrSlug) ? { id: idOrSlug, active: true } : { slug: idOrSlug, active: true },
      relations: { category: true },
    });
    if (!service) throw AppException.notFound('Servicio');
    return {
      ...presentService(service),
      category: { id: service.category.id, name: service.category.name, slug: service.category.slug },
    };
  }

  /**
   * LEGACY: ciudades con barrios cargados (antes, "ciudades donde opera Resuelve").
   * El catálogo nacional se consulta paginado en GET /localities (nunca entero).
   */
  async listCities() {
    const list = await this.cities
      .createQueryBuilder('c')
      .where('c.active AND EXISTS (SELECT 1 FROM zones z WHERE z.city_id = c.id AND z.active)')
      .orderBy('c.name', 'ASC')
      .getMany();
    return list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, province: c.province }));
  }

  /** Barrios de una localidad: por id (`locality`) o, legacy, por slug único (`city`). Sin ciudad: []. */
  async listZones(query: ZonesQueryDto) {
    let cityId = query.locality;
    if (!cityId && query.city) {
      const matches = await this.cities.find({ where: { slug: query.city, active: true }, select: { id: true } });
      if (matches.length > 1)
        throw AppException.unprocessable(
          ErrorCode.AMBIGUOUS_LOCALITY,
          'Hay varias localidades con ese nombre: indicá la localidad por id',
        );
      cityId = matches[0]?.id;
    }
    if (!cityId) return [];
    const list = await this.zones.find({
      where: { active: true, cityId, city: { active: true } },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return list.map(presentZone);
  }
}
