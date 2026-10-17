import { ProfessionalSummary, hasLicenseFor } from '../../../../core/models/professional';
import { IconName } from '../../../../shared/components/icon/icon';
import { TagTone } from '../../../../shared/components/tag/tag';
import { headlineRepeatsChips, serviceChipsView } from '../../../../core/utils/service-chips';

/**
 * Subtítulo de un resultado con chips de servicios: el título declarado (si no
 * repite un chip visible) y los años. Los servicios ya no se listan en texto.
 */
export function resultSubtitle(p: ProfessionalSummary, matchServiceId?: string | null): string {
  const chips = serviceChipsView(p.services, matchServiceId);
  const what = headlineRepeatsChips(p.headline, chips) ? '' : p.headline;
  const years = p.yearsExperience
    ? `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'} de experiencia`
    : '';
  return [what, years].filter(Boolean).join(' · ');
}

/** "Electricista matriculado · 12 años de experiencia": headline del profesional o sus servicios reales. */
export function professionalSubtitle(p: ProfessionalSummary): string {
  const what = p.headline || p.services.map((s) => s.name).join(', ');
  const years = p.yearsExperience
    ? `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'} de experiencia`
    : '';
  return [what, years].filter(Boolean).join(' · ');
}

export interface TrustSignal {
  label: string;
  icon: IconName;
  tone: TagTone;
}

/**
 * Señales públicas reales. La matrícula solo si el backend la tiene
 * verificada para el servicio (que el servicio la requiera no alcanza).
 */
export function trustSignals(
  p: ProfessionalSummary,
  licenseApplicable: boolean,
  serviceId?: string | null,
): TrustSignal[] {
  const out: TrustSignal[] = [];
  if (licenseApplicable && hasLicenseFor(p, serviceId))
    out.push({ label: 'Matrícula verificada', icon: 'shield', tone: 'brand' });
  if (p.verifications.identity)
    out.push({ label: 'Identidad verificada', icon: 'check', tone: 'brand' });
  if (p.completedJobsCount > 0) {
    out.push({
      label: `${p.completedJobsCount} ${p.completedJobsCount === 1 ? 'trabajo' : 'trabajos'} por Resuelve`,
      icon: 'briefcase',
      tone: 'neutral',
    });
  }
  return out;
}
