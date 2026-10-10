import { EntityManager, In } from 'typeorm';
import { ProfessionalProfile } from './professional-profile.entity';
import type { EligibilityProfile } from './professional-rules';

export type ProfileForEligibility = ProfessionalProfile & EligibilityProfile;

/** Perfiles con lo necesario para `requestIneligibility` (servicios y barrios). */
export async function loadEligibilityProfiles(
  m: EntityManager,
  ids: readonly string[],
): Promise<Map<string, ProfileForEligibility>> {
  if (!ids.length) return new Map();
  const profiles = await m.find(ProfessionalProfile, {
    where: { id: In([...ids]) },
    relations: { services: true, serviceAreas: true },
  });
  return new Map(
    profiles.map((p) => [
      p.id,
      Object.assign(p, {
        serviceIds: p.services.map((s) => s.serviceId),
        zoneIds: p.serviceAreas.map((a) => a.zoneId),
      }),
    ]),
  );
}
