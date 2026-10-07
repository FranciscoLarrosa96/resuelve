/**
 * Origen público del frontend para armar enlaces (emails, back_url de pago).
 * `FRONTEND_URL` es una lista de orígenes separados por coma (CORS): el primero
 * es el canónico. Nunca se pega la lista entera en un enlace.
 */
export function publicFrontendUrl(frontendUrl: string | undefined): string {
  const first = (frontendUrl ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .find(Boolean);
  return (first ?? 'http://localhost:4200').replace(/\/+$/, '');
}
