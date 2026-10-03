import type { IncomingMessage, ServerResponse } from 'node:http';

/** Rutas privadas o transaccionales. `robots.txt` no es seguridad: además llevan `noindex` y exigen sesión. */
export const DISALLOWED_PATHS = [
  '/api/',
  '/admin/',
  '/pro/',
  '/mis-solicitudes',
  '/mis-profesionales',
  '/perfil',
  '/solicitud',
  '/presupuesto',
  '/profesionales',
  '/soy-profesional',
  '/ingresar',
  '/registro',
  '/verificar-email',
];

export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const origin = process.env['PUBLIC_APP_URL'] || `https://${req.headers.host}`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.end(req.method === 'HEAD' ? undefined : robotsTxt(origin));
}
