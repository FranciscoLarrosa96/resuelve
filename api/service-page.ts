import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';
import {
  LANDING_PROFESSIONALS_LIMIT,
  LandingPlace,
  LandingProfessional,
  LandingService,
  SERVICE_SLUG,
  landingCopy,
  landingIndexable,
  landingJsonLd,
  landingPath,
  landingProfessionals,
  ratingText,
} from '../src/app/features/client/services/service-landing-content';

const escape = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type ApiService = { name: string; slug: string; categoryId: string; requiresLicense: boolean };
type ApiCategory = { id: string; name: string; slug: string };

/** Une servicio + categoría reales del backend. `null` si el servicio no existe (activo) en el catálogo. */
export function findLandingService(slug: string, services: ApiService[], categories: ApiCategory[]): { service: LandingService; related: LandingService[] } | null {
  const toLanding = (s: ApiService): LandingService | null => {
    const category = categories.find((c) => c.id === s.categoryId);
    return category ? { name: s.name, slug: s.slug, requiresLicense: s.requiresLicense, category: { name: category.name, slug: category.slug } } : null;
  };
  const found = services.find((s) => s.slug === slug);
  const service = found && toLanding(found);
  if (!service) return null;
  const related = services
    .filter((s) => s.categoryId === found.categoryId && s.slug !== slug)
    .map(toLanding)
    .filter((s): s is LandingService => !!s);
  return { service, related };
}

/** Localidad de la URL tal como la devuelve el backend (`/provinces/:p/localities/:l?service=`). */
export interface ApiLocality {
  id: string;
  name: string;
  slug: string;
  province: { name: string; slug: string };
  serviceProfessionalsCount?: number;
}

/** Localidades con profesionales del servicio (`/localities/served?service=`), para la página nacional. */
export interface ApiServedLocality {
  name: string;
  slug: string;
  label: string;
  province: { name: string; slug: string };
}

/** Contenido visible para buscadores dentro de `<app-root>`: Angular lo reemplaza al arrancar. */
export function landingBody(
  service: LandingService,
  related: LandingService[],
  professionals: LandingProfessional[] = [],
  place: LandingPlace | null = null,
  served: ApiServedLocality[] = [],
): string {
  const copy = landingCopy(service, place);
  const crumbs = place
    ? `<nav aria-label="Migas de pan"><a href="/servicios">Servicios</a> › <a href="${landingPath(service)}">${escape(service.name)}</a> › ${escape(place.name)}</nav>`
    : '';
  return (
    `<main>${crumbs}${copy.kicker ? `<p>${escape(copy.kicker)}</p>` : ''}<h1>${escape(copy.heading)}</h1><p>${escape(copy.intro)}</p>` +
    (professionals.length
      ? `<h2>${escape(copy.professionalsHeading)}</h2><ul>${professionals
          .map((p) => {
            const rating = ratingText(p);
            return `<li><a href="/p/${encodeURIComponent(p.slug)}">${escape(p.displayName)}</a>${p.headline ? ` · ${escape(p.headline)}` : ''}${rating ? ` · ${escape(rating)}` : ''}</li>`;
          })
          .join('')}</ul>`
      : '') +
    (copy.guide
      ? `<h2>Trabajos que suelen pedirse</h2><ul>${copy.guide.jobs.map((j) => `<li>${escape(j)}</li>`).join('')}</ul>` +
        `<h2>Antes de pedir tu presupuesto</h2><ul>${copy.guide.tips.map((t) => `<li>${escape(t)}</li>`).join('')}</ul>`
      : '') +
    `<h2>Cómo funciona</h2><ol>${copy.steps.map((s) => `<li><strong>${escape(s.title)}.</strong> ${escape(s.text)}</li>`).join('')}</ol>` +
    (copy.licenseNote ? `<p>${escape(copy.licenseNote)}</p>` : '') +
    `<h2>Preguntas frecuentes</h2>${copy.faq.map((f) => `<h3>${escape(f.question)}</h3><p>${escape(f.answer)}</p>`).join('')}` +
    (served.length && !place
      ? `<h2>${escape(service.name)} por localidad</h2><ul>${served
          .map((l) => `<li><a href="${landingPath(service, l)}">${escape(l.label)}</a></li>`)
          .join('')}</ul>`
      : '') +
    (place
      ? `<p><a href="/profesionales?servicio=${encodeURIComponent(service.slug)}&amp;provincia=${encodeURIComponent(place.province.slug)}&amp;ciudad=${encodeURIComponent(place.slug)}">Ver profesionales de ${escape(service.name.toLowerCase())} en ${escape(place.name)}</a></p>`
      : `<p><a href="/profesionales?servicio=${encodeURIComponent(service.slug)}">Ver profesionales de ${escape(service.name.toLowerCase())}</a></p>`) +
    (related.length
      ? `<h2>Otros servicios de ${escape(service.category.name)}</h2><ul>${related.map((r) => `<li><a href="/servicios/${encodeURIComponent(r.slug)}">${escape(r.name)}</a></li>`).join('')}</ul>`
      : '') +
    `<p><a href="/servicios">Todos los servicios</a></p></main>`
  );
}

export function serviceDocument(
  template: string,
  service: LandingService,
  related: LandingService[],
  origin: string,
  professionals: LandingProfessional[] = [],
  place: LandingPlace | null = null,
  placeProfessionals = 0,
  served: ApiServedLocality[] = [],
): string {
  const copy = landingCopy(service, place);
  const url = `${origin}${landingPath(service, place)}`;
  const image = `${origin}/og-image.png`;
  // Localidad sin profesionales del servicio: se puede ver y compartir, pero no se indexa (ni canonical).
  const indexable = landingIndexable(place, placeProfessionals);
  const tags =
    `<meta name="description" content="${escape(copy.description)}">` +
    (indexable ? `<link rel="canonical" href="${escape(url)}">` : '<meta name="robots" content="noindex, follow">') +
    `<meta property="og:title" content="${escape(copy.title)}"><meta property="og:description" content="${escape(copy.description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Resuelve"><meta property="og:locale" content="es_AR"><meta property="og:image" content="${escape(image)}">` +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(copy.title)}"><meta name="twitter:description" content="${escape(copy.description)}"><meta name="twitter:image" content="${escape(image)}">` +
    // `<` escapado: el contenido nunca puede cerrar la etiqueta <script>.
    `<script type="application/ld+json">${JSON.stringify(landingJsonLd(service, origin, place)).replace(/</g, '\\u003c')}</script>`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(copy.title)}</title>`)
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|name=["']twitter:[^"']+["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', tags + '</head>')
    .replace('<app-root></app-root>', `<app-root>${landingBody(service, related, professionals, place, served)}</app-root>`);
}

/** Página pública de un servicio para bots (el navegador recibe la app). Los datos salen del catálogo real del backend. */
export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const slug = req.query?.slug;
  // `/ciudades/:province/:locality/servicios/:slug`: provincia y localidad (slugs del catálogo).
  const provinceSlug = req.query?.province;
  const localitySlug = req.query?.locality;
  const withPlace = provinceSlug !== undefined || localitySlug !== undefined;
  const validSlug = (v: unknown): v is string => typeof v === 'string' && v.length <= 190 && SERVICE_SLUG.test(v);
  if (!validSlug(slug) || (withPlace && (!validSlug(provinceSlug) || !validSlug(localitySlug)))) {
    res.statusCode = 404;
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end('Servicio no encontrado');
    return;
  }
  const templatePath = join(process.cwd(), 'dist/resuelve/browser/index.csr.html');
  const apiUrl = process.env['PUBLIC_API_URL'] || environment.apiUrl;
  // Si el backend tarda o falla (arranque en frío), la app abre igual (carga el catálogo por su cuenta), pero con
  // 503 + Retry-After: el buscador vuelve más tarde y no saca la página del índice (un 200 con noindex sí la sacaría).
  const serveApp = async (): Promise<void> => {
    res.statusCode = 503;
    res.setHeader('Retry-After', '120');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const template = await readFile(templatePath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : template);
    } catch {
      res.end('No pudimos cargar esta página. Volvé a intentar.');
    }
  };
  try {
    const get = (path: string) => fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    // Los profesionales son un extra: si esa consulta falla, la página sale igual, sin la lista.
    let place: LandingPlace | null = null;
    let placeId: string | null = null;
    let placeProfessionals = 0;
    if (withPlace) {
      const placeRes = await get(
        `/provinces/${encodeURIComponent(provinceSlug as string)}/localities/${encodeURIComponent(localitySlug as string)}?service=${encodeURIComponent(slug)}`,
      );
      if (placeRes.status === 404) {
        res.statusCode = 404;
        res.setHeader('X-Robots-Tag', 'noindex');
        res.end('Localidad no encontrada');
        return;
      }
      if (!placeRes.ok) {
        await serveApp();
        return;
      }
      const detail = (await placeRes.json()) as ApiLocality;
      place = { name: detail.name, slug: detail.slug, province: detail.province };
      placeId = detail.id;
      placeProfessionals = detail.serviceProfessionalsCount ?? 0;
    }
    const [servicesRes, categoriesRes, professionalsRes, servedRes] = await Promise.all([
      get('/services'),
      get('/categories'),
      get(
        `/professionals?service=${encodeURIComponent(slug)}${placeId ? `&locality=${encodeURIComponent(placeId)}` : ''}&pageSize=${LANDING_PROFESSIONALS_LIMIT}`,
      ).catch(() => null),
      place ? Promise.resolve(null) : get(`/localities/served?service=${encodeURIComponent(slug)}`).catch(() => null),
    ]);
    if (!servicesRes.ok || !categoriesRes.ok) {
      await serveApp();
      return;
    }
    const found = findLandingService(slug, await servicesRes.json(), await categoriesRes.json());
    if (!found) {
      res.statusCode = 404;
      res.setHeader('X-Robots-Tag', 'noindex');
      res.end('Servicio no encontrado');
      return;
    }
    const professionals = professionalsRes?.ok ? landingProfessionals((await professionalsRes.json().catch(() => null))?.items) : [];
    const servedItems = servedRes?.ok ? (await servedRes.json().catch(() => null))?.items : null;
    const served: ApiServedLocality[] = Array.isArray(servedItems) ? servedItems.slice(0, 60) : [];
    const origin = process.env['PUBLIC_APP_URL'] || `https://${req.headers.host}`;
    const template = await readFile(templatePath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.end(
      req.method === 'HEAD'
        ? undefined
        : serviceDocument(template, found.service, found.related, origin, professionals, place, placeProfessionals, served),
    );
  } catch {
    await serveApp();
  }
}
