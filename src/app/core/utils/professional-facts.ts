/**
 * Datos de trayectoria que ve el cliente, en una sola frase cada uno. Solo con datos
 * reales: sin base suficiente devuelven null y no se muestra nada (nunca "0" ni "—").
 */

/** "Suele responder en menos de 1 h" (mediana real de sus últimas respuestas). */
export function responseText(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || minutes < 0) return null;
  if (minutes < 60) return 'Suele responder en menos de 1 h';
  if (minutes < 24 * 60) return `Suele responder en unas ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / (24 * 60));
  return days <= 1 ? 'Suele responder en 1 día' : `Suele responder en ${days} días`;
}

/** "En Resuelve desde octubre de 2026" (alta del perfil profesional). */
export function memberSinceText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const label = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
  return `En Resuelve desde ${label}`;
}
