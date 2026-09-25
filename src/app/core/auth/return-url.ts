/** Rutas de auth: nunca se vuelve a ellas después de ingresar. */
const AUTH_PATHS = ['/ingresar', '/registro'];

/**
 * Normaliza un `returnUrl` para que solo pueda apuntar a una ruta interna
 * de la app. Rechaza URLs absolutas, protocol-relative (`//evil.com`),
 * barras invertidas, esquemas (`javascript:`) y caracteres de control:
 * devuelve null y el llamador usa su destino por defecto.
 */
export function safeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  if (url.includes('\\') || /[\u0000-\u001f\u007f]/.test(url)) return null;
  if (/^\/[^/?#]*:/.test(url)) return null;
  const path = url.split(/[?#]/)[0];
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return null;
  return url;
}
