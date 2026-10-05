import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';

/** Páginas públicas indexables que no dependen de la API (las demás llevan `noindex`). */
export const STATIC_PATHS = ['/', '/servicios', '/urgencias', '/terminos', '/privacidad'];

const escapeXml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export function sitemapXml(origin: string, profiles: { slug: string; updatedAt?: string }[], services: { slug: string }[] = []): string {
  const urls = [
    ...STATIC_PATHS.map((path) => `<url><loc>${escapeXml(origin + path)}</loc></url>`),
    ...services
      .filter((s) => typeof s?.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug))
      .map((s) => `<url><loc>${escapeXml(`${origin}/servicios/${s.slug}`)}</loc></url>`),
    ...profiles
      .filter((p) => typeof p?.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug))
      .map((p) => {
        const lastmod = p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? new Date(p.updatedAt).toISOString().slice(0, 10) : '';
        return `<url><loc>${escapeXml(`${origin}/p/${p.slug}`)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
      }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
}

/** Sitemap dinámico: páginas públicas + servicios del catálogo + perfiles activos con servicio publicable (los decide el backend). */
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
  let complete = true;
  try {
    const apiUrl = process.env['PUBLIC_API_URL'] || environment.apiUrl;
    const get = (path: string) => fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    const [profilesRes, servicesRes] = await Promise.all([get('/professionals/sitemap'), get('/services')]);
    const parsedProfiles = profilesRes.ok ? await profilesRes.json().catch(() => null) : null;
    if (Array.isArray(parsedProfiles)) profiles = parsedProfiles;
    else complete = false;
    const parsedServices = servicesRes.ok ? await servicesRes.json().catch(() => null) : null;
    if (Array.isArray(parsedServices)) services = parsedServices;
    else complete = false;
  } catch {
    // Backend dormido o caído: se publican igual las páginas estáticas, con caché corto para reintentar pronto.
    complete = false;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', complete ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' : 'public, max-age=0, s-maxage=60');
  res.end(req.method === 'HEAD' ? undefined : sitemapXml(origin, profiles, services));
}
