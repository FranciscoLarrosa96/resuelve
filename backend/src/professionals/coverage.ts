import { EntityManager, In } from 'typeorm';
import { City } from '../catalog/city.entity';
import { findActiveLocality } from '../catalog/localities.service';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import type { CoverageLocalityDto } from './dto/professional.dto';
import { ProfessionalLocality } from './professional-locality.entity';
import { ProfessionalProfile } from './professional-profile.entity';
import { ProfessionalServiceArea } from './professional-service-area.entity';

/**
 * Cobertura de un profesional en varias localidades. Única escritura de
 * `professional_localities` + `professional_service_areas` +
 * `primary_city_id` (y el espejo legacy `covers_entire_city`).
 */

const invalid = (message: string, details?: unknown) =>
  AppException.unprocessable(ErrorCode.VALIDATION_ERROR, message, details ?? { fields: ['coverage'] });

/**
 * Reemplaza toda la cobertura. Reglas (servidor, aunque se llame a la API a mano):
 * localidades activas y sin repetir; barrios activos y de ESA localidad; en cada localidad
 * "toda la ciudad" o al menos un barrio (una localidad sin barrios cargados, solo toda la
 * ciudad); la principal es una de las cubiertas.
 */
export async function saveCoverage(
  m: EntityManager,
  professionalId: string,
  coverage: readonly CoverageLocalityDto[],
  primaryLocalityId?: string | null,
): Promise<void> {
  const ids = coverage.map((c) => c.localityId);
  if (new Set(ids).size !== ids.length) throw invalid('Hay una localidad repetida');
  for (const entry of coverage) {
    const locality = await findActiveLocality(m, entry.localityId);
    const zoneIds = entry.zoneIds ?? [];
    if (zoneIds.length) {
      const valid = await m.countBy(Zone, { id: In(zoneIds), cityId: entry.localityId, active: true });
      if (valid !== zoneIds.length)
        throw invalid(`Algún barrio no es de ${locality.name}`, {
          fields: ['coverage'],
          localityId: entry.localityId,
        });
    }
    if (!entry.coversEntireCity && !zoneIds.length) {
      throw invalid(
        locality.hasZones
          ? `Elegí al menos un barrio de ${locality.name} o marcá que trabajás en toda la ciudad`
          : `${locality.name} no tiene barrios cargados: marcá que trabajás en toda la ciudad`,
        { fields: ['coverage'], localityId: entry.localityId },
      );
    }
  }

  const current = await m.findOneByOrFail(ProfessionalProfile, { id: professionalId });
  const primary =
    primaryLocalityId ??
    (current.primaryCityId && ids.includes(current.primaryCityId) ? current.primaryCityId : ids[0]);
  if (!ids.includes(primary))
    throw invalid('La ciudad principal tiene que ser una de las localidades donde trabajás', {
      fields: ['primaryLocalityId'],
    });

  await m.delete(ProfessionalLocality, { professionalId });
  await m.insert(
    ProfessionalLocality,
    coverage.map((c) => ({ professionalId, cityId: c.localityId, coversEntireCity: c.coversEntireCity })),
  );
  await m.delete(ProfessionalServiceArea, { professionalId });
  const zoneIds = coverage.flatMap((c) => c.zoneIds ?? []);
  if (zoneIds.length)
    await m.insert(
      ProfessionalServiceArea,
      zoneIds.map((zoneId) => ({ professionalId, zoneId })),
    );
  await m.update(ProfessionalProfile, professionalId, {
    primaryCityId: primary,
    coversEntireCity: coverage.find((c) => c.localityId === primary)!.coversEntireCity,
  });
}

/** Cobertura actual en el formato del DTO (para editar una parte y volver a guardar). */
export async function loadCoverage(m: EntityManager, professionalId: string): Promise<CoverageLocalityDto[]> {
  const [localities, areas] = await Promise.all([
    m.find(ProfessionalLocality, { where: { professionalId }, order: { createdAt: 'ASC' } }),
    m.find(ProfessionalServiceArea, { where: { professionalId }, relations: { zone: true } }),
  ]);
  return localities.map((l) => ({
    localityId: l.cityId,
    coversEntireCity: l.coversEntireCity,
    zoneIds: areas.filter((a) => a.zone.cityId === l.cityId).map((a) => a.zoneId),
  }));
}

/**
 * Contrato anterior (una sola ciudad): `coversEntireCity` y/o `zoneIds` sueltos. Se
 * aplican a UNA localidad: la de los barrios enviados, si no la principal, si no
 * `LEGACY_LOCALITY` (clientes viejos que solo conocían esa ciudad). Las otras
 * localidades del perfil no se tocan.
 */
export async function applyLegacyCoverage(
  m: EntityManager,
  profile: Pick<ProfessionalProfile, 'id' | 'primaryCityId'>,
  dto: { coversEntireCity?: boolean; zoneIds?: string[] },
  legacyLocality: string,
): Promise<void> {
  let cityId: string | null = null;
  if (dto.zoneIds?.length) {
    const zones = await m.findBy(Zone, { id: In(dto.zoneIds), active: true });
    if (zones.length !== dto.zoneIds.length) throw invalid('Alguna zona no existe', { fields: ['zoneIds'] });
    const cities = new Set(zones.map((z) => z.cityId));
    if (cities.size > 1)
      throw invalid('Los barrios son de distintas localidades: usá `coverage`', { fields: ['zoneIds'] });
    cityId = zones[0].cityId;
  }
  cityId ??= profile.primaryCityId;
  if (!cityId) {
    const [provinceSlug, slug] = legacyLocality.split('/');
    const city = await m
      .createQueryBuilder(City, 'c')
      .innerJoin('c.provinceRef', 'pr')
      .where('pr.slug = :provinceSlug AND c.slug = :slug AND c.active', { provinceSlug, slug })
      .getOne();
    if (!city) throw invalid('Elegí la localidad donde trabajás', { fields: ['coverage'] });
    cityId = city.id;
  }
  const coverage = await loadCoverage(m, profile.id);
  const existing = coverage.find((c) => c.localityId === cityId);
  const entry: CoverageLocalityDto = {
    localityId: cityId,
    coversEntireCity: dto.coversEntireCity ?? existing?.coversEntireCity ?? false,
    zoneIds: dto.zoneIds ?? existing?.zoneIds ?? [],
  };
  if (!entry.coversEntireCity && !entry.zoneIds?.length)
    throw invalid('Elegí al menos un barrio o marcá que trabajás en toda la ciudad', { fields: ['zoneIds'] });
  const next = existing ? coverage.map((c) => (c.localityId === cityId ? entry : c)) : [...coverage, entry];
  await saveCoverage(m, profile.id, next, profile.primaryCityId ?? cityId);
}
