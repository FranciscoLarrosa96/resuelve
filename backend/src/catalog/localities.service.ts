import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { COVERS_LOCALITY_SQL } from '../professionals/professional-rules';
import { LocalitySearchDto } from './dto/locality-query.dto';
import { searchPrefix } from './geo/geo-text';
import { presentZone } from './catalog.service';
import { Zone } from './zone.entity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tope de localidades en el sitemap / vitrina nacional (las que tienen profesionales reales). */
const SERVED_LIMIT = 1000;

interface LocalityRow {
  id: string;
  name: string;
  slug: string;
  department_name: string | null;
  province_id: string;
  province_name: string;
  province_slug: string;
  ambiguous: boolean;
}

/**
 * Perfiles públicos (activos, con un servicio activo) que cubren la localidad `c.id`.
 * `serviceParam`: además ofrecen ese servicio (slug o id). Misma regla que la búsqueda.
 */
const PUBLIC_PROS_IN_LOCALITY_SQL = (serviceParam: string | null, serviceIsUuid = false) => `(
  SELECT count(*)::int FROM professional_profiles p
   WHERE p.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active
                    ${serviceParam ? `AND ${serviceIsUuid ? 's.id' : 's.slug'} = ${serviceParam}` : ''})
     AND ${COVERS_LOCALITY_SQL('c.id', null)})`;

const LOCALITY_COLUMNS = `c.id, c.name, c.slug, c.department_name,
  pr.id AS province_id, pr.name AS province_name, pr.slug AS province_slug,
  EXISTS (SELECT 1 FROM cities c2 WHERE c2.province_id = c.province_id AND c2.search_name = c.search_name
           AND c2.id <> c.id AND c2.active) AS ambiguous`;

/**
 * Lo público de una localidad. `label` siempre dice la provincia y, si hay un
 * homónimo en la misma provincia, el departamento ("El Rincón (Caucete), San Juan").
 * `path` es lo que usan las URLs semánticas (`buenos-aires/tandil`).
 */
export function presentLocality(r: LocalityRow) {
  const name = r.ambiguous && r.department_name ? `${r.name} (${r.department_name})` : r.name;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    department: r.department_name,
    province: { id: r.province_id, name: r.province_name, slug: r.province_slug },
    label: `${name}, ${r.province_name}`,
    path: `${r.province_slug}/${r.slug}`,
  };
}

export type PresentedLocality = ReturnType<typeof presentLocality>;

/**
 * Catálogo de provincias y localidades (Georef, en PostgreSQL). Nunca consulta
 * Georef en una búsqueda. Público: solo datos del catálogo y conteos agregados
 * de perfiles públicos (nunca quién ni dónde vive nadie).
 */
@Injectable()
export class LocalitiesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listProvinces() {
    const rows: { id: string; name: string; slug: string; official_code: string }[] =
      await this.dataSource.query(
        `SELECT id, name, slug, official_code FROM provinces WHERE active ORDER BY name`,
      );
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, officialCode: r.official_code }));
  }

  /**
   * Autocompletar: primero las que empiezan con el texto, después las que tienen una
   * palabra que empieza así; dentro de cada grupo, las que ya tienen profesionales.
   * Sin texto: las localidades con profesionales (las más activas primero).
   */
  async search(q: LocalitySearchDto) {
    const prefix = searchPrefix(q.search ?? '');
    const params: unknown[] = [];
    const where: string[] = ['c.active', 'pr.active'];
    if (q.province) {
      params.push(q.province);
      where.push(UUID.test(q.province) ? `pr.id = $${params.length}` : `pr.slug = $${params.length}`);
    }
    let order: string;
    if (prefix) {
      params.push(prefix);
      const n = params.length;
      where.push(`(c.search_name LIKE $${n} || '%' OR c.search_name LIKE '% ' || $${n} || '%')`);
      order = `(c.search_name LIKE $${n} || '%') DESC, (professionals > 0) DESC, length(c.search_name), c.search_name, pr.name`;
    } else {
      where.push(
        `EXISTS (SELECT 1 FROM professional_localities pl WHERE pl.city_id = c.id) AND ${PUBLIC_PROS_IN_LOCALITY_SQL(null)} > 0`,
      );
      order = 'professionals DESC, c.search_name';
    }
    params.push(q.limit);
    const rows: (LocalityRow & { professionals: number })[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT ${LOCALITY_COLUMNS}, c.search_name, ${PUBLIC_PROS_IN_LOCALITY_SQL(null)} AS professionals
           FROM cities c JOIN provinces pr ON pr.id = c.province_id
          WHERE ${where.join(' AND ')}) c
        ORDER BY ${order.replace(/pr\.name/g, 'c.province_name')}
        LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map((r) => ({ ...presentLocality(r), hasProfessionals: r.professionals > 0 })) };
  }

  /** Detalle por id. 404 si no existe o está inactiva. */
  async get(id: string, service?: string) {
    if (!UUID.test(id)) throw AppException.notFound('Localidad');
    return this.detail('c.id = $1', [id], service);
  }

  /** Detalle por URL semántica (/ciudades/:provincia/:localidad). */
  async getBySlug(provinceSlug: string, localitySlug: string, service?: string) {
    return this.detail('pr.slug = $1 AND c.slug = $2', [provinceSlug, localitySlug], service);
  }

  async neighborhoods(id: string) {
    await this.get(id);
    const zones = await this.dataSource.getRepository(Zone).find({
      where: { cityId: id, active: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return zones.map(presentZone);
  }

  /**
   * Localidades con al menos un profesional público (de `service`, si viene), con su
   * conteo. Para el sitemap y las páginas de servicio: solo se publica lo que tiene oferta real.
   */
  async served(service?: string) {
    const params: unknown[] = [];
    if (service) params.push(service);
    const count = PUBLIC_PROS_IN_LOCALITY_SQL(service ? '$1' : null, !!service && UUID.test(service));
    const rows: (LocalityRow & { professionals: number; updated_at: Date })[] = await this.dataSource.query(
      `SELECT * FROM (
         SELECT ${LOCALITY_COLUMNS}, ${count} AS professionals, c.updated_at
           FROM cities c JOIN provinces pr ON pr.id = c.province_id
          WHERE c.active AND pr.active AND EXISTS (SELECT 1 FROM professional_localities pl WHERE pl.city_id = c.id)
       ) c WHERE professionals > 0
        ORDER BY professionals DESC, name LIMIT ${SERVED_LIMIT}`,
      params,
    );
    return { items: rows.map((r) => ({ ...presentLocality(r), professionalsCount: r.professionals })) };
  }

  private async detail(where: string, params: unknown[], service?: string) {
    const serviceN = params.length + 1;
    const rows: (LocalityRow & {
      zones: number;
      professionals: number;
      service_professionals: number | null;
    })[] = await this.dataSource.query(
      `SELECT ${LOCALITY_COLUMNS},
                (SELECT count(*)::int FROM zones z WHERE z.city_id = c.id AND z.active) AS zones,
                ${PUBLIC_PROS_IN_LOCALITY_SQL(null)} AS professionals,
                ${service ? PUBLIC_PROS_IN_LOCALITY_SQL(`$${serviceN}`, UUID.test(service)) : 'NULL'} AS service_professionals
           FROM cities c JOIN provinces pr ON pr.id = c.province_id
          WHERE c.active AND pr.active AND ${where}`,
      service ? [...params, service] : params,
    );
    if (!rows.length) throw AppException.notFound('Localidad');
    const r = rows[0];
    return {
      ...presentLocality(r),
      /** Tiene barrios cargados: el pedido y la cobertura pueden elegir barrio. */
      hasNeighborhoods: r.zones > 0,
      /** Perfiles públicos que cubren la localidad (agregado, sin datos de nadie). */
      professionalsCount: r.professionals,
      ...(service ? { serviceProfessionalsCount: r.service_professionals ?? 0 } : {}),
    };
  }
}

/** Localidad activa por id, con su provincia. 422 si no existe (para validar DTOs). */
export async function findActiveLocality(m: EntityManager, id: string) {
  const [row]: { id: string; name: string; has_zones: boolean }[] = await m.query(
    `SELECT c.id, c.name, EXISTS (SELECT 1 FROM zones z WHERE z.city_id = c.id AND z.active) AS has_zones
       FROM cities c JOIN provinces pr ON pr.id = c.province_id
      WHERE c.id = $1 AND c.active AND pr.active`,
    [id],
  );
  if (!row)
    throw new AppException(
      ErrorCode.INVALID_WORK_LOCATION,
      'La localidad no existe',
      HttpStatus.UNPROCESSABLE_ENTITY,
      {
        fields: ['localityId'],
      },
    );
  return { id: row.id, name: row.name, hasZones: row.has_zones };
}
