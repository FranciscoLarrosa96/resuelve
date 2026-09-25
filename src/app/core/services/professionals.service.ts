import { Injectable, inject } from '@angular/core';
import { PortfolioItem, Professional, Review, VerificationCheck } from '../models/professional';
import {
  DEFAULT_PORTFOLIO,
  PORTFOLIO_BY_SERVICE,
  TYPICAL_JOBS_BY_SERVICE,
} from '../data/catalog.data';
import { PROFESSIONALS } from '../data/professionals.data';
import { CatalogStore } from '../state/catalog.store';

export interface ProfessionalDetail {
  services: string[];
  portfolio: PortfolioItem[];
  about: string;
  checks: VerificationCheck[];
  ratingDistribution: { stars: number; pct: number }[];
  reviews: Review[];
}

/**
 * Profesionales (mock). Punto único para reemplazar por la API.
 * Se filtran por slug del catálogo real (compatibilidad temporal).
 */
@Injectable({ providedIn: 'root' })
export class ProfessionalsService {
  private readonly catalog = inject(CatalogStore);
  readonly all: readonly Professional[] = PROFESSIONALS;

  byId(id: string | null | undefined): Professional | undefined {
    return this.all.find((p) => p.id === id);
  }

  /** Igual que byId pero nunca devuelve undefined (fallback al primero). */
  get(id: string | null | undefined): Professional {
    return this.byId(id) ?? this.all[0];
  }

  many(ids: readonly string[]): Professional[] {
    return ids.map((id) => this.byId(id)).filter((p): p is Professional => !!p);
  }

  offering(serviceSlug: string): Professional[] {
    return this.all.filter((p) => p.serviceSlugs.includes(serviceSlug));
  }

  /** Quienes pueden ir ya, ordenados por tiempo de respuesta. */
  availableNow(serviceSlug: string): Professional[] {
    return this.offering(serviceSlug)
      .filter((p) => p.availableToday && p.nextSlot.startsWith('Ahora'))
      .sort((a, b) => a.responseMinutes - b.responseMinutes);
  }

  detail(pro: Professional): ProfessionalDetail {
    const main = pro.serviceSlugs[0];
    const names = pro.serviceSlugs
      .map((slug) => this.catalog.serviceBySlug(slug)?.name)
      .filter((name): name is string => !!name);
    const services = names.length > 1 ? names : TYPICAL_JOBS_BY_SERVICE[main] ?? names;
    return {
      services,
      portfolio: PORTFOLIO_BY_SERVICE[main] ?? DEFAULT_PORTFOLIO,
      about: `Trabajo en Tandil hace ${pro.yearsExperience} años. Presupuesto sin cargo, llego con los materiales y dejo garantía por escrito en cada trabajo.`,
      checks: [
        { title: 'Identidad verificada', detail: 'DNI y selfie · marzo 2026' },
        ...(pro.licenseVerified
          ? [
              {
                title: pro.licenseLabel ?? 'Matrícula verificada',
                detail: `Matrícula N.º ${4000 + pro.jobsCount * 3} · vigente hasta 2027`,
              },
            ]
          : []),
        { title: 'Teléfono verificado', detail: 'Contacto real y activo' },
      ],
      ratingDistribution: [
        { stars: 5, pct: 86 },
        { stars: 4, pct: 11 },
        { stars: 3, pct: 3 },
        { stars: 2, pct: 0 },
        { stars: 1, pct: 0 },
      ],
      reviews: [
        {
          text: 'Excelente. Llegó a horario y el precio coincidió con el presupuesto.',
          author: 'Mariana L.', initials: 'ML', zone: 'Villa Italia',
          job: services[0] ?? 'Trabajo', date: 'hace 2 semanas',
        },
        {
          text: pro.highlight,
          author: 'Diego R.', initials: 'DR', zone: 'Centro',
          job: services[1] ?? 'Reparación', date: 'agosto 2026',
        },
        {
          text: 'Le escribí a la mañana y a la tarde ya estaba resuelto. Lo recomiendo.',
          author: 'Silvia M.', initials: 'SM', zone: 'Uncas',
          job: services[2] ?? 'Reparación', date: 'julio 2026',
        },
      ],
    };
  }
}
