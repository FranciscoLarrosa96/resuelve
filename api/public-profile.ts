import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';

type PublicProfileMeta = {
  displayName: string;
  headline?: string | null;
  avatarUrl?: string | null;
  acceptingRequests?: boolean;
  services?: { name: string }[];
  averageRating?: number | null;
  reviewsCount?: number;
};

/** Mismas reglas que el sitemap del backend: activo y con al menos un servicio publicable. */
export function isIndexable(profile: PublicProfileMeta): boolean {
  return profile.acceptingRequests !== false && Array.isArray(profile.services) && profile.services.length > 0;
}

/** JSON-LD público: nombre, oficio, zona general y valoración real. Nunca contacto, dirección ni coordenadas. */
export function profileJsonLd(profile: PublicProfileMeta, canonical: string): string {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: profile.displayName,
    url: canonical,
    areaServed: { '@type': 'City', name: 'Tandil' },
  };
  if (profile.headline) data['description'] = profile.headline;
  if (profile.avatarUrl && /^https:\/\//.test(profile.avatarUrl)) data['image'] = profile.avatarUrl;
  if (profile.services?.length) data['makesOffer'] = profile.services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name } }));
  if (profile.reviewsCount && profile.reviewsCount > 0 && profile.averageRating) {
    data['aggregateRating'] = {
      '@type': 'AggregateRating',
      ratingValue: profile.averageRating,
      reviewCount: profile.reviewsCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  // `<` escapado: el contenido nunca puede cerrar la etiqueta <script>.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Public metadata adapter for the existing static Angular build. Never forwards auth or loads private APIs. */
export async function profileDocument(
  template: string,
  profile: PublicProfileMeta,
  canonical: string,
): Promise<string> {
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
    );
  const profession = profile.headline || profile.services?.[0]?.name || 'Profesional';
  const title = `${profile.displayName} — ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'} | Resuelve`;
  const description = `${profile.displayName}. ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'}. Conocé su trabajo, opiniones y pedí presupuesto por Resuelve.`;
  const hasAvatar = !!profile.avatarUrl && /^https:\/\//.test(profile.avatarUrl);
  // Sin foto, la imagen de marca (1200×630) del mismo origen: nunca un preview vacío.
  let image = hasAvatar ? profile.avatarUrl! : '';
  if (!image) {
    try {
      image = `${new URL(canonical).origin}/og-image.png`;
    } catch {
      image = '';
    }
  }
  const indexable = isIndexable(profile);
  const tags =
    `<meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}">` +
    (indexable ? '' : '<meta name="robots" content="noindex, follow">') +
    `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Resuelve"><meta property="og:locale" content="es_AR">` +
    (image ? `<meta property="og:image" content="${escape(image)}">` : '') +
    `<meta name="twitter:card" content="${image && !hasAvatar ? 'summary_large_image' : 'summary'}">` +
    (indexable ? `<script type="application/ld+json">${profileJsonLd(profile, canonical)}</script>` : '');
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(title)}</title>`)
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|name=["']twitter:[^"']+["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace('</head>', tags + '</head>')
    .replace(
      '</body>',
      `<noscript><h1>${escape(profile.displayName)}</h1><p>${escape(profession)}</p>${profile.acceptingRequests === false ? '<p>Este profesional no está recibiendo nuevas solicitudes por ahora.</p>' : '<p>Activá JavaScript para ver su trabajo y pedir presupuesto en Resuelve.</p>'}</noscript></body>`,
    );
}

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
  if (typeof slug !== 'string' || slug.length > 190 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    res.statusCode = 404;
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end('Perfil no encontrado');
    return;
  }
  const templatePath = join(process.cwd(), 'dist/resuelve/browser/index.csr.html');
  // Los metadatos son un extra: si el backend tarda (arranque en frío) o falla, la app igual
  // tiene que abrir el perfil, que lo carga por su cuenta. Nunca dejamos el QR/enlace en un error.
  // Va con 503 + Retry-After (el navegador muestra la app igual): el buscador vuelve más tarde
  // en vez de sacar el perfil del índice, como haría con un 200 + noindex.
  const serveApp = async (): Promise<void> => {
    res.statusCode = 503;
    res.setHeader('Retry-After', '120');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const template = await readFile(templatePath, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : template);
    } catch {
      res.end('No pudimos cargar este perfil. Volvé a intentar.');
    }
  };
  try {
    const response = await fetch(
      `${process.env['PUBLIC_API_URL'] || environment.apiUrl}/professionals/public/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } },
    );
    if (response.status === 404) {
      res.statusCode = 404;
      res.setHeader('X-Robots-Tag', 'noindex');
      res.end('Perfil no encontrado');
      return;
    }
    if (!response.ok) {
      await serveApp();
      return;
    }
    const profile = await response.json();
    const origin = process.env['PUBLIC_APP_URL'] || `https://${req.headers.host}`;
    const template = await readFile(templatePath, 'utf8');
    const html = await profileDocument(template, profile, `${origin}/p/${slug}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    if (!isIndexable(profile)) res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch {
    await serveApp();
  }
}
