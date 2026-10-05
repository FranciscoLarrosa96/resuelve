/**
 * Contenido de la página pública de un servicio (`/servicios/:slug`). Única fuente: la comparte la página de Angular
 * y `api/service-page.ts` (HTML para buscadores). Solo dice lo que el producto hace: nada de precios, cantidades ni
 * profesionales inventados.
 */
export interface LandingService {
  name: string;
  slug: string;
  requiresLicense: boolean;
  category: { name: string; slug: string };
}

export interface LandingCopy {
  title: string;
  description: string;
  heading: string;
  intro: string;
  steps: { title: string; text: string }[];
  licenseNote: string | null;
}

export const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function landingCopy(service: LandingService): LandingCopy {
  return {
    title: `${service.name} en Tandil · Resuelve`,
    description: `${service.name} en Tandil: contá qué necesitás, recibí presupuestos de profesionales de la ciudad, compará y elegí con quién coordinar el trabajo.`,
    heading: `${service.name} en Tandil`,
    intro: `Contanos qué necesitás y los profesionales de ${service.name.toLowerCase()} de Tandil te responden con su presupuesto. Vos comparás y elegís.`,
    steps: [
      { title: 'Contá qué necesitás', text: 'Describí el trabajo, dónde es y para cuándo lo querés.' },
      { title: 'Recibí presupuestos', text: 'Los profesionales de Tandil que cubren tu zona te mandan su propuesta.' },
      { title: 'Elegí y coordiná', text: 'Elegís al profesional, acuerdan el día y la hora, y el trabajo queda agendado.' },
    ],
    licenseNote: service.requiresLicense
      ? 'Este servicio requiere matrícula: Resuelve verifica el número de matrícula de cada profesional en el registro oficial.'
      : null,
  };
}

/** Datos estructurados: el servicio (zona general Tandil, sin contacto) y las migas de pan. */
export function landingJsonLd(service: LandingService, origin: string): Record<string, unknown> {
  const url = `${origin}/servicios/${service.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: `${service.name} en Tandil`,
        serviceType: service.name,
        url,
        areaServed: { '@type': 'City', name: 'Tandil' },
        provider: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Resuelve', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Servicios', item: `${origin}/servicios` },
          { '@type': 'ListItem', position: 3, name: service.name, item: url },
        ],
      },
    ],
  };
}
