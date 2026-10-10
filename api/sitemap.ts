import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';

/** Páginas públicas indexables que no dependen de la API (las demás llevan `noindex`). */
export const STATIC_PATHS = ['/', '/servicios', '/urgencias', '/terminos', '/privacidad'];

const escapeXml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Página de un servicio en una localidad con oferta real (`/localities/served-services`). */
export interface CityServicePage {
  path: string;
  service: string;
}

export function sitemapXml(
  origin: string,
  profiles: { slug: string; updatedAt?: string }[],
  services: { slug: string }[] = [],
  cityServices: CityServicePage[] = [],
): string {
  const urls = [
    ...STATIC_PATHS.map((path) => `<url><loc>${escapeXml(origin + path)}</loc></url>`),
    ...services
      .filter((s) => typeof s?.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug))
      .map((s) => `<url><loc>${escapeXml(`${origin}/servicios/${s.slug}`)}</loc></url>`),
    // Solo localidad × servicio con profesionales reales: nunca miles de páginas vacías.
    ...cityServices
      .filter((c) => typeof c?.path === 'string' && typeof c.service === 'string' && SLUG.test(c.service))
      .filter((c) => c.path.split('/').length === 2 && c.path.split('/').every((part) => SLUG.test(part)))
      .map((c) => `<url><loc>${escapeXml(`${origin}/ciudades/${c.path}/servicios/${c.service}`)}</loc></url>`),
    ...profiles
      .filter((p) => typeof p?.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug))
      .map((p) => {
        const lastmod = p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? new Date(p.updatedAt).toISOString().slice(0, 10) : '';
        return `<url><loc>${escapeXml(`${origin}/p/${p.slug}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
      }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
}

/**
 * Sitemap dinámico: páginas públicas + servicios del catálogo + servicio por localidad (solo con oferta real) +
 * perfiles activos con servicio publicable (los decide el backend).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.end();
    return;
  }
  const origin = process.env['PUBLIC_APP_URL'] || `https://${req.headers.host}`;
  let profiles: { slug: string; updatedAt?: string }[] = [];
  let services: { slug: string }[] = [];
  let cityServices: CityServicePage[] = [];
  let complete = true;
  try {
    const apiUrl = process.env['PUBLIC_API_URL'] || environment.apiUrl;
    const get = (path: string) => fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    const [profilesRes, servicesRes, cityRes] = await Promise.all([
      get('/professionals/sitemap'),
      get('/services'),
      get('/localities/served-services'),
    ]);
    const parsedProfiles = profilesRes.ok ? await profilesRes.json().catch(() => null) : null;
    if (Array.isArray(parsedProfiles)) profiles = parsedProfiles;
    else complete = false;
    const parsedServices = servicesRes.ok ? await servicesRes.json().catch(() => null) : null;
    if (Array.isArray(parsedServices)) services = parsedServices;
    else complete = false;
    const parsedCities = cityRes.ok ? await cityRes.json().catch(() => null) : null;
    if (Array.isArray(parsedCities?.items)) cityServices = parsedCities.items;
    else complete = false;
  } catch {
    // Backend dormido o caído: se publican igual las páginas estáticas, con caché corto para reintentar pronto.
    complete = false;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', complete ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'public, max-age=0, s-maxage=60');
  res.end(req.method === 'HEAD' ? undefined : sitemapXml(origin, profiles, services, cityServices));
}
