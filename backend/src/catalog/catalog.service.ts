import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { Category } from './category.entity';
import { City } from './city.entity';
import { Service } from './service.entity';
import { Zone } from './zone.entity';
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
  ) {}

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

  async listCities() {
    const list = await this.cities.find({ where: { active: true }, order: { name: 'ASC' } });
    return list.map((c) => ({ id: c.id, name: c.name, slug: c.slug, province: c.province }));
  }

  async listZones(query: ZonesQueryDto) {
    const list = await this.zones.find({
      where: { active: true, city: { slug: query.city ?? 'tandil', active: true } },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return list.map(presentZone);
  }
}
