import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalSummary, coverageText, hasLicenseFor } from '../../../../core/models/professional';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { SearchStore } from '../../../../core/state/search.store';
import { oneDecimal } from '../../../../core/utils/format';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Icon, IconName } from '../../../../shared/components/icon/icon';
import { FeaturedLabel, ProBadge } from '../../../../shared/components/plan-badges/plan-badges';
import { TagTone } from '../../../../shared/components/tag/tag';
import { VerifiedSeal } from '../../../../shared/components/verified-seal/verified-seal';

/**
 * Resultado responsive: identidad | señales |
 * acciones. Se lee de izquierda a derecha: quién es, qué hace, si inspira
 * confianza, si está disponible y dónde trabaja. Solo datos reales.
 */
@Component({
  selector: 'app-result-card, app-result-card-mobile',
  imports: [RouterLink, Avatar, Icon, VerifiedSeal, ProBadge, FeaturedLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'professional-result',
    '[class.featured]': '!!pro().isFeaturedPlacement',
    '[class.selected]': 'selected()',
  },
  styleUrl: './result-card.css',
  templateUrl: './result-card.html',
})
export class ResultCard {
  protected readonly search = inject(SearchStore);
  private readonly pros = inject(ProfessionalsStore);
  readonly pro = input.required<ProfessionalSummary>();
  readonly ask = output<ProfessionalSummary>();

  protected readonly avatar = computed(() => avatarOf(this.pro()));
  protected readonly selected = computed(() => this.search.selectedIds().includes(this.pro().id));
  protected readonly subtitle = computed(() => professionalSubtitle(this.pro()));
  protected readonly zones = computed(() => coverageText(this.pro()));
  protected readonly trust = computed(() =>
    trustSignals(this.pro(), this.search.licenseApplicable(), this.pros.filters().serviceId),
  );
  protected readonly f1 = oneDecimal;
}

/** "Electricista matriculado · 12 años de experiencia": headline del profesional o sus servicios reales. */
export function professionalSubtitle(p: ProfessionalSummary): string {
  const what = p.headline || p.services.map((s) => s.name).join(', ');
  const years = p.yearsExperience ? `${p.yearsExperience} ${p.yearsExperience === 1 ? 'año' : 'años'} de experiencia` : '';
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
export function trustSignals(p: ProfessionalSummary, licenseApplicable: boolean, serviceId?: string | null): TrustSignal[] {
  const out: TrustSignal[] = [];
  if (licenseApplicable && hasLicenseFor(p, serviceId)) out.push({ label: 'Matrícula verificada', icon: 'shield', tone: 'brand' });
  if (p.verifications.identity) out.push({ label: 'Identidad verificada', icon: 'check', tone: 'brand' });
  if (p.completedJobsCount > 0) {
    out.push({
      label: `${p.completedJobsCount} ${p.completedJobsCount === 1 ? 'trabajo' : 'trabajos'} por Resuelve`,
      icon: 'briefcase',
      tone: 'neutral',
    });
  }
  return out;
}
