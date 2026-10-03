import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { environment } from '../src/environments/environment';

/** Public metadata adapter for the existing static Angular build. Never forwards auth or loads private APIs. */
export async function profileDocument(
  template: string,
  profile: {
    displayName: string;
    headline?: string | null;
    avatarUrl?: string | null;
    acceptingRequests?: boolean;
  },
  canonical: string,
): Promise<string> {
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
    );
  const profession = profile.headline || 'Profesional';
  const title = `${profile.displayName} — ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'} | Resuelve`;
  const description = `${profile.displayName}. ${profession}${/tandil/i.test(profession) ? '' : ' en Tandil'}. Conocé su trabajo, opiniones y pedí presupuesto por Resuelve.`;
  const tags = `<meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="profile">${profile.avatarUrl && /^https:\/\//.test(profile.avatarUrl) ? `<meta property="og:image" content="${escape(profile.avatarUrl)}">` : ''}`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escape(title)}</title>`)
    .replace(/<meta\b[^>]*(?:name=["']description["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
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
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch {
    await serveApp();
  }
}
