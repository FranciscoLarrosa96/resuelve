import { Injectable } from '@angular/core';
import { CategoryName } from '../models/category';
import { PortfolioItem, Professional, Review, VerificationCheck } from '../models/professional';
import {
  DEFAULT_PORTFOLIO,
  PORTFOLIO_BY_CATEGORY,
  SERVICES_BY_CATEGORY,
} from '../data/catalog.data';
import { PROFESSIONALS } from '../data/professionals.data';

export interface ProfessionalDetail {
  services: string[];
  portfolio: PortfolioItem[];
  about: string;
  checks: VerificationCheck[];
  ratingDistribution: { stars: number; pct: number }[];
  reviews: Review[];
}

/** Catálogo de profesionales (mock). Punto único para reemplazar por la API. */
@Injectable({ providedIn: 'root' })
export class ProfessionalsService {
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

  inCategory(category: CategoryName): Professional[] {
    return this.all.filter((p) => p.services.some((service) => service.id === category));
  }

  /** Quienes pueden ir ya, ordenados por tiempo de respuesta. */
  availableNow(category: CategoryName): Professional[] {
    return this.inCategory(category)
      .filter((p) => p.availableToday && p.nextSlot.startsWith('Ahora'))
      .sort((a, b) => a.responseMinutes - b.responseMinutes);
  }

  detail(pro: Professional): ProfessionalDetail {
    const category = pro.categories[0];
    const services = pro.services.length > 1
      ? pro.services.map((service) => service.id)
      : SERVICES_BY_CATEGORY[category] ?? pro.services.map((service) => service.id);
    return {
      services,
      portfolio: PORTFOLIO_BY_CATEGORY[category] ?? DEFAULT_PORTFOLIO,
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
