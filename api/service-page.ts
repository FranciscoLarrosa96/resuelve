import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';
import {
  LandingService,
  SERVICE_SLUG,
  landingCopy,
  landingJsonLd,
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

/** Contenido visible para buscadores dentro de `<app-root>`: Angular lo reemplaza al arrancar. */
export function landingBody(service: LandingService, related: LandingService[]): string {
  const copy = landingCopy(service);
  return (
    `<main><h1>${escape(copy.heading)}</h1><p>${escape(copy.intro)}</p>` +
    (copy.guide
      ? `<h2>Trabajos que suelen pedirse</h2><ul>${copy.guide.jobs.map((j) => `<li>${escape(j)}</li>`).join('')}</ul>` +
        `<h2>Antes de pedir tu presupuesto</h2><ul>${copy.guide.tips.map((t) => `<li>${escape(t)}</li>`).join('')}</ul>`
      : '') +
    `<h2>Cómo funciona</h2><ol>${copy.steps.map((s) => `<li><strong>${escape(s.title)}.</strong> ${escape(s.text)}</li>`).join('')}</ol>` +
    (copy.licenseNote ? `<p>${escape(copy.licenseNote)}</p>` : '') +
    `<p><a href="/profesionales?servicio=${encodeURIComponent(service.slug)}">Ver profesionales de ${escape(service.name.toLowerCase())}</a></p>` +
    (related.length
      ? `<h2>Otros servicios de ${escape(service.category.name)}</h2><ul>${related.map((r) => `<li><a href="/servicios/${encodeURIComponent(r.slug)}">${escape(r.name)}</a></li>`).join('')}</ul>`
      : '') +
    `<p><a href="/servicios">Todos los servicios</a></p></main>`
  );
}

export function serviceDocument(template: string, service: LandingService, related: LandingService[], origin: string): string {
  const copy = landingCopy(service);
  const url = `${origin}/servicios/${service.slug}`;
  const image = `${origin}/og-image.png`;
  const tags =
    `<meta name="description" content="${escape(copy.description)}"><link rel="canonical" href="${escape(url)}">` +
    `<meta property="og:title" content="${escape(copy.title)}"><meta property="og:description" content="${escape(copy.description)}"><meta property="og:url" content="${escape(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="Resuelve"><meta property="og:locale" content="es_AR"><meta property="og:image" content="${escape(image)}">` +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(copy.title)}"><meta name="twitter:description" content="${escape(copy.description)}"><meta name="twitter:image" content="${escape(image)}">` +
    // `<` escapado: el contenido nunca puede cerrar la etiqueta <script>.
    `<script type="application/ld+json">${JSON.stringify(landingJsonLd(service, origin)).replace(/</g, '\\u003c')}</script>`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(copy.title)}</title>`)
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|name=["']twitter:[^"']+["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', tags + '</head>')
    .replace('<app-root></app-root>', `<app-root>${landingBody(service, related)}</app-root>`);
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
  if (typeof slug !== 'string' || slug.length > 190 || !SERVICE_SLUG.test(slug)) {
    res.statusCode = 404;
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end('Servicio no encontrado');
    return;
  }
  const templatePath = join(process.cwd(), 'dist/resuelve/browser/index.csr.html');
  const apiUrl = process.env['PUBLIC_API_URL'] || environment.apiUrl;
  // Si el backend tarda o falla, la app abre igual (carga el catálogo por su cuenta), sin indexar.
  const serveApp = async (): Promise<void> => {
    try {
      const template = await readFile(templatePath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      res.end(req.method === 'HEAD' ? undefined : template);
    } catch {
      res.statusCode = 503;
      res.setHeader('X-Robots-Tag', 'noindex');
      res.end('No pudimos cargar esta página. Volvé a intentar.');
    }
  };
  try {
    const get = (path: string) => fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    const [servicesRes, categoriesRes] = await Promise.all([get('/services'), get('/categories')]);
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
    const origin = process.env['PUBLIC_APP_URL'] || `https://${req.headers.host}`;
    const template = await readFile(templatePath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.end(req.method === 'HEAD' ? undefined : serviceDocument(template, found.service, found.related, origin));
  } catch {
    await serveApp();
  }
}
